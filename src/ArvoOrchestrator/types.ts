import {
  ArvoContract,
  ArvoOrchestratorVersion,
  ArvoOrchestratorContract,
  ArvoEvent,
} from 'arvo-core';
import ArvoMachine from '../ArvoMachine';
import { AnyActorLogic } from 'xstate';
import { z } from 'zod';
import { XStatePersistanceSchema } from './schema';

/**
 * Interface representing an Arvo Orchestrator.
 *
 * @template TUri - The type for the URI of the orchestrator.
 * @template TInitType - The type for the initialization type string.
 * @template TInit - The Zod schema type for initialization data.
 * @template TCompleteType - The type for the completion type string.
 * @template TComplete - The Zod schema type for completion data.
 * @template TServiceContracts - A record of service contracts, each adhering to ArvoContract.
 * @template TLogic - The type of actor logic used in the state machine, extending AnyActorLogic from XState.
 */
export interface IArvoOrchestrator<
  TUri extends string,
  TInitType extends string,
  TInit extends z.ZodTypeAny,
  TCompleteType extends string,
  TComplete extends z.ZodTypeAny,
  TServiceContracts extends Record<string, ArvoContract>,
  TLogic extends AnyActorLogic,
> {
  /**
   * The number of execution units available to the orchestrator.
   * This likely represents a resource limit or capacity measure.
   */
  executionunits: number;

  /**
   * An array of ArvoMachine instances that the orchestrator manages.
   * Each machine is typed with specific parameters to ensure type safety
   * and consistency across the orchestration process.
   */
  machines: ArvoMachine<
    string,
    ArvoOrchestratorVersion,
    ArvoOrchestratorContract<TUri, TInitType, TInit, TCompleteType, TComplete>,
    TServiceContracts,
    TLogic
  >[];
}

/**
 * Type definition for the input required to execute an Arvo Orchestrator.
 */
export type ArvoOrchestratorExecuteInput = {
  /**
   * The event which triggers the orchestrator execution cycle.
   * This event likely contains data or instructions that guide
   * the orchestration process.
   */
  event: ArvoEvent;

  /**
   * The current state of the orchestrator.
   *
   * This is a zipped base64 string representation of the existing state
   * of the orchestrator. If the state is NULL,
   * the orchestrator assumes a fresh orchestration and creates a new state.
   *
   * The use of a zipped base64 string allows for efficient storage and
   * transmission of potentially complex state data.
   */
  state: string | null;

  /**
   * Configuration for OpenTelemetry integration.
   *
   * OpenTelemetry is an observability framework for cloud-native software,
   * providing a collection of tools, APIs, and SDKs for distributed tracing,
   * metrics collection, and logging.
   *
   * In the context of ArvoOrchestrator, OpenTelemetry is used to trace
   * the execution flow, measure performance, and provide insights into
   * the behavior of the orchestration process.
   *
   * @optional
   */
  opentelemetry?: {
    /**
     * Specifies the source from which to inherit the OpenTelemetry span context.
     *
     * The span context contains information that identifies a span's position
     * in a trace, including trace ID, span ID, and trace flags. Inheriting this
     * context allows for correlation of the current execution with its parent
     * process or triggering event.
     *
     * @property {'event' | 'execution'} inheritFrom
     *
     * - 'event': The OpenTelemetry context is extracted from the `event.traceparent`
     *   and `event.tracestate` fields. This is useful when the triggering event
     *   carries its own tracing information, allowing for end-to-end tracing
     *   across system boundaries.
     *
     * - 'execution': The span context is inherited from the function execution
     *   environment. This is typically used when the ArvoOrchestrator is running
     *   in an environment that has its own OpenTelemetry instrumentation, such as
     *   a serverless platform or a containerized application with OpenTelemetry
     *   auto-instrumentation.
     *
     * Choosing the appropriate inheritance source ensures that the ArvoOrchestrator's
     * telemetry data is correctly correlated with the broader system's observability
     * data, facilitating more effective tracing, debugging, and performance analysis.
     */
    inheritFrom: 'event' | 'execution';
  };
};

/**
 * Type definition for the output produced by executing an Arvo Orchestrator.
 * This type encapsulates the result of an orchestration execution cycle.
 */
export type ArvoOrchestratorExecuteOutput = {
  /**
   * The encoded state of the orchestration after execution.
   *
   * This is a zipped base64 string representation of the updated state
   * of the orchestrator.
   *
   * This state can be used as input for subsequent execution cycles,
   * allowing for continuity in long-running or multi-step orchestrations.
   */
  state: string | null;

  /**
   * An array of events emitted by the orchestration during execution.
   *
   * These events represent significant occurrences or state changes
   * that happened during the orchestration process.
   */
  events: ArvoEvent[];

  /**
   * The execution status of the orchestration.
   *
   * Indicates whether the orchestration execution completed successfully
   * or encountered an error. This allows consumers of the orchestrator
   * to quickly determine if the execution proceeded as expected or if
   * error handling and recovery steps may be necessary.
   *
   * - 'success': Indicates that the orchestration completed without errors.
   * - 'error': Indicates that an error occurred during orchestration execution.
   */
  executionStatus: 'success' | 'error';

  /**
   * The snapshot of the execution. This is the uncompressed and un-encoded
   * version of the value in the field 'state'
   */
  snapshot: z.infer<typeof XStatePersistanceSchema> | null;
};
