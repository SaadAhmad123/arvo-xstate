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
import { ExecutionOpenTelemetryConfiguration } from '../types';

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
   * The subject field value of the parent orchestration or process.
   *
   * This field plays a crucial role in maintaining the hierarchical structure and routing
   * of events within a multi-level orchestration system:
   *
   * 1. Hierarchy:
   *    - If null: Indicates this is a root orchestration execution.
   *    - If provided: Signifies this is a child execution within a larger orchestration hierarchy.
   *
   * 2. Event Routing:
   *    - For child executions, error events and completion events will have their subject
   *      set to this parentSubject value.
   *    - This ensures that events are correctly routed back to the process initiator
   *      and can be reconciled with the parent process.
   *
   * 3. State Management:
   *    - It's recommended to store the parentSubject and the current execution's subject
   *      together in a key-value format for efficient state tracking and retrieval.
   *
   * 4. Data Structure Example:
   *    | Hash Key (subject)     | Range Key (parentSubject) | State                           |
   *    |------------------------|---------------------------|-------------------------------- |
   *    | current event subject  | parentSubject value       | orchestration state (as string) |
   *
   * 5. Root vs Child Execution:
   *    - Root Execution: parentSubject is null, and the original subject is preserved.
   *    - Child Execution: parentSubject is set, allowing for proper event routing and hierarchy tracking.
   *
   * This design facilitates complex, nested orchestrations while maintaining clear
   * parent-child relationships and ensuring correct event routing throughout the system.
   */
  parentSubject: string | null;

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
  opentelemetry?: ExecutionOpenTelemetryConfiguration;
};

/**
 * Type definition for the output produced by executing an Arvo Orchestrator.
 * This type encapsulates the result of an orchestration execution cycle.
 */
export type ArvoOrchestratorExecuteOutput = {
  /**
   * The subject of the current orchestration execution.
   *
   * This field represents the unique identifier for the current orchestration execution.
   * It is identical to the subject field in the triggering event.
   *
   * Significance:
   * 1. Identification: Uniquely identifies this specific orchestration execution within the system.
   * 2. Correlation: Allows for correlation between the input event and the execution output.
   * 3. Traceability: Enables tracking of the orchestration execution across different components or services.
   * 4. State Management: Can be used as a key for storing and retrieving the orchestration state.
   * 5. Event Routing: For root orchestrations, this subject is used for routing completion or error events.
   *
   * Note: In a hierarchical orchestration structure, this subject represents the current level,
   * while the parentSubject (if present) represents the level above.
   */
  subject: string;

  /**
   * The subject of the parent orchestration or process.
   *
   * This field is a passthrough from the input, representing the subject of the parent
   * orchestration or process that initiated this execution.
   *
   * Significance:
   * 1. Hierarchy:
   *    - If null: Indicates this is a root orchestration execution.
   *    - If present: Signifies this is a child execution within a larger orchestration hierarchy.
   * 2. Event Routing:
   *    - For child executions, this value is used as the subject for error and completion events,
   *      ensuring they are correctly routed back to the parent process.
   * 3. Context Preservation: Maintains the context of the orchestration hierarchy across executions.
   * 4. State Management:
   *    - Facilitates efficient storage and retrieval of orchestration states in a nested structure.
   *    - Enables reconstruction of the full orchestration tree if needed.
   * 5. Debugging and Monitoring: Allows for tracing the execution path through multiple levels of orchestration.
   *
   * Note: The combination of subject and parentSubject provides a complete picture of the
   * orchestration's position within the overall process hierarchy.
   */
  parentSubject: string | null;

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
