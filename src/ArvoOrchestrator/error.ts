import { type ArvoEvent, ViolationError } from 'arvo-core';

export enum TransactionViolationCause {
  READ_FAILURE = 'READ_MACHINE_MEMORY_FAILURE',
  LOCK_FAILURE = 'LOCK_MACHINE_MEMORY_FAILURE',
  WRITE_FAILURE = 'WRITE_MACHINE_MEMORY_FAILURE',
  LOCK_UNACQUIRED = 'LOCK_UNACQUIRED',
  INVALID_SUBJECT = 'INVALID_SUBJECT',
}

export class TransactionViolation extends ViolationError<'ArvoTransaction'> {
  readonly cause: TransactionViolationCause;

  constructor(param: {
    cause: TransactionViolationCause;
    message: string;
    initiatingEvent: ArvoEvent;
  }) {
    super({
      type: 'ArvoTransaction',
      message: `[${param.cause}] ${param.message}`,
      metadata: {
        initiatingEvent: param.initiatingEvent,
      },
    });
    this.cause = param.cause;
  }
}
