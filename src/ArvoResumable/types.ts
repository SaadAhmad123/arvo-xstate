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

type Handler<
  TState extends ArvoResumableState<Record<string, any>>,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = (param: {
  span: Span;
  metadata: Omit<TState, 'state$$'> | null;
  state: TState['state$$'] | null;
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
}) => Promise<{
  state?: TState['state$$'];
  complete?: {
    [L in keyof InferVersionedArvoContract<TSelfContract>['emits']]: EnqueueArvoEventActionParam<
      InferVersionedArvoContract<TSelfContract>['emits'][L]['data'],
      InferVersionedArvoContract<TSelfContract>['emits'][L]['type']
    >;
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
