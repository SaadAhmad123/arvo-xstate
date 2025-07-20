import type {
  VersionedArvoContract,
  ArvoSemanticVersion,
  InferVersionedArvoContract,
  ArvoContract,
  ArvoEvent,
  InferArvoEvent,
} from 'arvo-core';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import type { Span } from '@opentelemetry/api';

type ExtractServiceEventTypes<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> = {
  [K in keyof TServiceContract]:
    | {
        [L in keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]: {
          type: InferVersionedArvoContract<TServiceContract[K]>['emits'][L]['type'];
          event: InferVersionedArvoContract<TServiceContract[K]>['emits'][L];
        };
      }[keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]
    | {
        type: InferVersionedArvoContract<TServiceContract[K]>['systemError']['type'];
        event: InferVersionedArvoContract<TServiceContract[K]>['systemError'];
      };
}[keyof TServiceContract];

type AllServiceEventTypes<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> =
  ExtractServiceEventTypes<TServiceContract>['type'];

type ServiceEventTypeMap<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> = {
  [T in ExtractServiceEventTypes<TServiceContract> as T['type']]: T['event'];
};

type Handler<
  TState extends ArvoResumableState<Record<string, any>>,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = (param: {
  span: Span;
  metadata: Omit<TState, 'state$$'> | null;
  collectedEvents: Partial<{
    [K in AllServiceEventTypes<TServiceContract>]: ServiceEventTypeMap<TServiceContract>[K][];
  }>;
  context: TState['state$$'] | null;
  init: InferVersionedArvoContract<TSelfContract>['accepts'] | null;
  service:
    | {
        [K in keyof TServiceContract]:
          | {
              [L in keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]: InferVersionedArvoContract<
                TServiceContract[K]
              >['emits'][L];
            }[keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]
          | InferVersionedArvoContract<TServiceContract[K]>['systemError'];
      }[keyof TServiceContract]
    | null;
  contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };
}) => Promise<{
  context?: TState['state$$'];
  complete?: {
    [L in keyof InferVersionedArvoContract<TSelfContract>['emits']]: Omit<
      EnqueueArvoEventActionParam<
        InferVersionedArvoContract<TSelfContract>['emits'][L]['data'],
        InferVersionedArvoContract<TSelfContract>['emits'][L]['type']
      >,
      'type'
    > & {
      type?: InferVersionedArvoContract<TSelfContract>['emits'][L]['type'];
    };
  }[keyof InferVersionedArvoContract<TSelfContract>['emits']];
  services?: Array<
    {
      [K in keyof TServiceContract]: EnqueueArvoEventActionParam<
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['data'],
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['type']
      >;
    }[keyof TServiceContract]
  >;
  // biome-ignore lint/suspicious/noConfusingVoidType: Make the function more ergonomic in coding
} | void>;

/**
 * The versioned orchestration handlers in ArvoResumable workflows
 *
 * It maps each version of an orchestrator contract to its corresponding handler function.
 * Each handler receives workflow context (state, events, contracts) and returns execution results
 * that can update state, complete the workflow, or invoke external services.
 *
 * The handler is called for each event that matches the orchestrator's contract, whether it's
 * an initialization event or a service response. The handler must be deterministic and
 * idempotent to ensure reliable workflow execution across potential retries.
 *
 * @param param - Handler execution context
 * @param param.span - OpenTelemetry span for distributed tracing
 * @param param.metadata - Complete workflow metadata (null for new workflows)
 * @param param.collectedEvents - Type-safe map of event types to their corresponding typed event arrays,
 *                                enabling strongly-typed access with full IntelliSense support.
 * @param param.context - Current workflow state (null for new workflows)
 * @param param.init - Initialization event data (only present for workflow start events)
 * @param param.service - Service response event data (only present for service callbacks)
 * @param param.contracts - Available contracts for type validation and event creation
 * @param param.contracts.self - The orchestrator's own versioned contract
 * @param param.contracts.services - External service contracts for invocation
 *
 * @returns Promise resolving to execution result or void
 * @returns result.context - Updated workflow state to persist
 * @returns result.complete - Workflow completion event to emit (ends the workflow)
 * @returns result.services - Array of service invocation events to emit
 *
 * @remarks
 * - Each version key must match a valid semantic version in the self contract
 * - Handlers should be pure functions without side effects beyond the returned actions
 * - State updates are atomic - either all changes persist or none do
 * - Only one of `init` or `service` will be non-null for any given invocation
 * - Returning void or an empty object indicates no state changes or events to emit
 * - Service events are supposed to queued for execution and may trigger callback events
 * - Completion events terminate the workflow and route to the parent orchestrator
 */
export type ArvoResumableHandler<
  TState extends ArvoResumableState<Record<string, any>>,
  TSelfContract extends ArvoContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = {
  [V in ArvoSemanticVersion & keyof TSelfContract['versions']]: Handler<
    TState,
    VersionedArvoContract<TSelfContract, V>,
    TServiceContract
  >;
};

export type ArvoResumableState<T extends Record<string, any>> = {
  /**
   * Current execution status of the orchestration workflow
   *
   * This field tracks the lifecycle state of the workflow instance to determine
   * whether it can accept new events and continue processing or has reached
   * its terminal state.
   *
   * @remarks
   * - **active**: The workflow is running and can accept events for processing.
   *   It may be waiting for service responses, processing initialization events,
   *   or handling intermediate workflow steps. The orchestrator will continue
   *   to route events to active workflows.
   *
   * - **done**: The workflow has completed its execution lifecycle. This status
   *   is set when the handler returns a `complete` event, indicating the workflow
   *   has finished successfully. Done workflows will not process additional events
   *   and their state is preserved for audit/debugging purposes.
   */
  status: 'active' | 'done';

  /** Unique identifier for the machine instance */
  subject: string;

  /**
   * Reference to the parent orchestration's subject when orchestrations are nested or chained.
   * This enables hierarchical orchestration patterns where one orchestration can spawn
   * sub-orchestrations. When the current orchestration completes, its completion event
   * is routed back to this parent subject rather than staying within the current context.
   *
   * - For root orchestrations: null
   * - For nested orchestrations: contains the subject of the parent orchestration
   * - Extracted from the `parentSubject$$` field in initialization events
   */
  parentSubject: string | null;

  /**
   * The unique identifier of the event that originally initiated this entire orchestration workflow.
   * This serves as the root identifier for tracking the complete execution chain from start to finish.
   *
   * - For new orchestrations: set to the current event's ID
   * - For resumed orchestrations: retrieved from the stored state
   * - Used as the `parentid` for completion events to create a direct lineage back to the workflow's origin
   *
   * This enables tracing the entire execution path and ensures completion events reference
   * the original triggering event rather than just the immediate previous step.
   */
  initEventId: string;

  events: {
    /** The event consumed by the machine in the last session */
    consumed: ArvoEvent | null;

    /**
     * The domained events produced by the machine in the last session
     * {[id]: {...ArvoEvent.toJSON(), domain: string[]}}
     */
    produced: Record<string, { domains: string[] } & InferArvoEvent<ArvoEvent>> | null;

    /**
     * The events expected by the resumable. These events are collected on each execution
     * as long as the event parent id and the expected key matches. The expected key is the
     * event.id of the produced event.
     */
    expected: Record<string, InferArvoEvent<ArvoEvent>[]> | null;
  };

  /** The state used by the resumable */
  state$$: T | null;
};
