import { Snapshot } from 'xstate';
import { IMachineMemory } from '../MachineMemory/interface';
import { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import { IMachineRegistry } from '../MachineRegistry/interface';
import ArvoMachine from '../ArvoMachine';

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

  /** Optional reference to parent orchestration subject */
  parentSubject: string | null;

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
