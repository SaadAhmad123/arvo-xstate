import { ArvoEvent } from 'arvo-core';

/**
 * Error thrown during Arvo orchestration operations
 */
export class ArvoOrchestratorError extends Error {
  /**
   * Type of error that occurred
   */
  readonly name: ErrorName;

  /**
   * Event that triggered the error
   */
  readonly initiatingEvent: ArvoEvent;

  /**
   * Creates an orchestration error
   * @param param Error parameters
   */
  constructor(param: {
    name: ErrorName;
    message: string;
    initiatingEvent: ArvoEvent;
  }) {
    super(param.message);
    this.name = param.name;
    this.initiatingEvent = param.initiatingEvent;
  }
}

/**
 * Possible orchestrator error types
 */
type ErrorName = 'READ_MACHINE_MEMORY' | 'ACQUIRE_LOCK';
