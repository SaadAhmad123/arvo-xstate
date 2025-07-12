import type { ArvoEvent, InferArvoEvent } from 'arvo-core';
import type { Snapshot } from 'xstate';
import type ArvoMachine from '../ArvoMachine';
import type { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { IMachineRegistry } from '../MachineRegistry/interface';

export type TryFunctionOutput<TData, TError extends Error> =
  | {
      type: 'success';
      data: TData;
    }
  | {
      type: 'error';
      error: TError;
    };

/**
 * Represents the state record stored in machine memory.
 */
export type MachineMemoryRecord = {
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

  /**
   * Current execution status of the machine. The status field represents the current
   * state of the machine's lifecycle. While commonly used values are:
   * - 'active': Machine is currently executing
   * - 'done': Machine has completed its execution successfully
   * - 'error': Machine encountered an error during execution
   * - 'stopped': Machine execution was explicitly stopped
   *
   * Due to XState dependency, the status can be any string value defined in the
   * state machine definition. This allows for custom states specific to the
   * business logic implemented in the state machine.
   */
  status: string;

  /** Current value stored in the machine state */
  value: string | Record<string, any> | null;

  /** XState snapshot representing the machine's current state */
  state: Snapshot<any>;

  events: {
    /** The event consumed by the machine in the last session */
    consumed: ArvoEvent | null;

    /**
     * The domained events produced by the machine in the last session
     * {[id]: {...ArvoEvent.toJSON(), domain: string[]}}
     */
    produced: Record<string, { domains: string[] } & InferArvoEvent<ArvoEvent>>;
  };

  /** Machine definition string */
  machineDefinition: string | null;
};

/**
 * Interface defining the core components of an Arvo orchestrator.
 */
export interface IArvoOrchestrator {
  /** The cost of the execution of the orchestrator */
  executionunits: number;

  /** Memory interface for storing and retrieving machine state */
  memory: IMachineMemory<MachineMemoryRecord>;

  /** Registry for managing and resolving machine instances */
  registry: IMachineRegistry;

  /** Engine responsible for machine execution */
  executionEngine: IMachineExectionEngine;

  /* A flag notifying the orchestrator if the resource locking is needed or not */
  requiresResourceLocking: boolean;
}

/**
 * Configuration interface for creating an Arvo orchestrator instance.
 */
export interface ICreateArvoOrchestrator {
  /** Memory interface for storing and retrieving machine state */
  memory: IMachineMemory<MachineMemoryRecord>;

  /** The cost of the execution of the orchestrator */
  executionunits: number;

  /**
   * Collection of state machines to be managed by the orchestrator.
   * All machines must have the same source identifier.
   */
  machines: ArvoMachine<any, any, any, any, any>[];
}
