import { ArvoEvent } from 'arvo-core';

export enum ArvoTransactionErrorName {
  READ_FAILURE = 'READ_MACHINE_MEMORY_FAILURE',
  LOCK_FAILURE = 'LOCK_MACHINE_MEMORY_FAILURE',
  WRITE_FAILURE = 'WRITE_MACHINE_MEMORY_FAILURE',
  LOCK_UNACQUIRED = 'LOCK_UNACQUIRED',
  INVALID_SUBJECT = 'INVALID_SUBJECT',
}

/**
 * Error thrown during Arvo orchestration operations
 */
export class ArvoTransactionError extends Error {
  readonly name = 'ArvoTransactionError' as const;

  /**
   * Type of error that occurred
   */
  readonly type: ArvoTransactionErrorName;

  /**
   * Event that triggered the error
   */
  readonly initiatingEvent: ArvoEvent;

  /**
   * Creates an orchestration error
   * @param param Error parameters
   */
  constructor(param: {
    type: ArvoTransactionErrorName;
    message: string;
    initiatingEvent: ArvoEvent;
  }) {
    super(param.message);
    this.type = param.type;
    this.initiatingEvent = param.initiatingEvent;
  }
}
