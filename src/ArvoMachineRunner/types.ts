import { ArvoOrchestratorContract, ArvoEvent } from 'arvo-core';
import ArvoMachine from '../ArvoMachine';
import { z } from 'zod';
import { XStatePersistanceSchema } from './schema';

/**
 * Core interface for an Arvo Orchestrator, responsible for managing and coordinating
 * multiple state machines in a type-safe manner.
 *
 * The orchestrator handles versioning, state management, and coordination between
 * multiple ArvoMachine instances. It ensures type safety across different versions
 * of the orchestration contract.
 *
 * @template TSelfContract Extends ArvoOrchestratorContract - Defines the contract
 * that this orchestrator implements, including supported versions and their specifications
 */
export interface IArvoMachineRunner<
  TSelfContract extends ArvoOrchestratorContract,
> {
  /** The contract defining the orchestrator's capabilities and supported versions */
  contract: TSelfContract;

  /**
   * Resource limit defining the maximum number of execution units available.
   * Used to prevent infinite loops and ensure resource constraints are respected.
   */
  executionunits: number;

  /**
   * Collection of versioned state machines managed by this orchestrator.
   *
   * Each version corresponds to a specific implementation of the orchestrator's
   * contract, allowing for backward compatibility and gradual upgrades.
   *
   * @remarks
   * The type mapping ensures that each machine version correctly implements
   * its corresponding contract version, maintaining type safety across versions.
   */
  machines: Record<
    keyof TSelfContract['versions'],
    ArvoMachine<any, any, any, any, any>
  >;
}

/**
 * Input parameters for executing an Arvo Orchestrator.
 */
export type ArvoMachineRunnerExecuteInput = {
  /**
   * The triggering event for this execution cycle.
   */
  event: ArvoEvent;

  /**
   * Compressed state representation of the orchestrator.
   *
   * @remarks
   * - Stored as a base64-encoded zipped string for efficient transmission
   * - Null indicates a new orchestration should be initialized
   * - When provided, represents the previous state to resume from
   */
  state: string | null;

  /**
   * Identifier of the parent orchestration process.
   *
   * @remarks
   * Critical for nested orchestrations and event routing:
   * - Null represents a root-level orchestration
   * - Non-null indicates a child orchestration
   * - Used for:
   *   1. Event routing in hierarchical orchestrations
   *   2. State management and retrieval
   *   3. Error and completion event propagation
   *   4. Maintaining process hierarchies
   *
   * @example
   * Storage structure for state management:
   * ```
   * {
   *   subject: "current-execution-id",
   *   parentSubject: "parent-execution-id",
   *   state: "compressed-state-data"
   * }
   * ```
   */
  parentSubject: string | null;
};

/**
 * Output produced by an Arvo Orchestrator execution cycle.
 *
 * @remarks
 * Encapsulates all results and side effects of an orchestration execution,
 * including state changes, emitted events, and execution status.
 */
export type ArvoMachineRunnerExecuteOutput = {
  /**
   * Unique identifier for this orchestration execution.
   *
   * @remarks
   * - Matches the subject from the triggering event
   * - Used for:
   *   1. Correlation between input and output
   *   2. State storage and retrieval
   *   3. Event routing
   *   4. Execution tracing
   */
  subject: string;

  /**
   * Reference to the parent orchestration's identifier.
   *
   * @remarks
   * - Null for root orchestrations
   * - Used for:
   *   1. Maintaining orchestration hierarchies
   *   2. Event routing to parent processes
   *   3. State management in nested structures
   *   4. Debugging and monitoring complex workflows
   */
  parentSubject: string | null;

  /**
   * Compressed state after execution completion.
   *
   * @remarks
   * - Base64-encoded zipped string of the orchestrator's state
   * - Null if the orchestration has completed or failed
   * - Used as input for subsequent execution cycles
   */
  state: string | null;

  /**
   * Collection of events generated during execution.
   *
   * @remarks
   * Events represent state transitions, decisions, or other significant
   * occurrences during the orchestration process.
   */
  events: ArvoEvent[];

  /**
   * Final status of the execution cycle.
   *
   * @remarks
   * - 'success': Orchestration completed normally
   * - 'error': Orchestration encountered an error
   */
  executionStatus: 'success' | 'error';

  /**
   * Uncompressed state representation.
   *
   * @remarks
   * Raw state data before compression and encoding.
   * Useful for debugging and direct state inspection.
   */
  snapshot: z.infer<typeof XStatePersistanceSchema> | null;
};
