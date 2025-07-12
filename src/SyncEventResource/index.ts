import { ArvoOrchestrationSubject, logToSpan, type ArvoEvent } from 'arvo-core';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { AcquiredLockStatusType, ReleasedLockStatusType } from './types';
import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrator/error';
import { ExecutionViolation } from 'arvo-event-handler';
import type { Span } from '@opentelemetry/api';

/**
 * A synchronous event resource that manages machine memory state based on event subjects.
 *
 * This class provides a distributed-system-safe mechanism for persisting and retrieving machine memory
 * objects that are correlated with ArvoEvent subjects. It acts as a key-value store where
 * the event subject serves as the key and the memory object serves as the value.
 *
 * Key features:
 * - JSON serializable memory persistence
 * - Optional resource locking for distributed concurrent access control
 * - Subject-based memory correlation across multiple service instances
 * - Transaction-safe operations with proper error handling
 * - Optional OpenTelemetry span integration for observability
 *
 * @template T - The type of the memory object, must extend Record<string, any> and be JSON serializable
 *
 * @example
 * ```typescript
 * type MyMemory = {
 *   counter: number;
 *   status: string;
 * }
 *
 * class MemoryImplementation implements IMachineMemory<MyMemory> { ... }
 *
 * const resource = new SyncEventResource<MyMemory>(
 *   new MemoryImplementation(),
 *   true // enable resource locking for distributed systems
 * );
 * ```
 */
export class SyncEventResource<T extends Record<string, any>> {
  constructor(
    public memory: IMachineMemory<T>,
    public requiresResourceLocking: boolean,
  ) {}

  /**
   * Acquires a lock on the event subject to prevent concurrent access across distributed services.
   *
   * This method ensures distributed-system-safe access to the memory resource by preventing
   * multiple service instances from modifying the same event subject simultaneously. If resource
   * locking is disabled, it will skip the lock acquisition process. The lock is subject-specific,
   * meaning different event subjects can be processed concurrently across services.
   *
   * @returns A promise that resolves to the lock acquisition status:
   *          - 'ACQUIRED': Lock was successfully acquired
   *          - 'NOT_ACQUIRED': Lock acquisition failed (resource busy by another service)
   *          - 'NOOP': Lock acquisition was skipped (locking disabled)
   *
   * @throws {TransactionViolation} When lock acquisition fails due to system errors
   */
  public async acquireLock(event: ArvoEvent, span?: Span): Promise<AcquiredLockStatusType> {
    if (!this.requiresResourceLocking) {
      logToSpan(
        {
          level: 'INFO',
          message: `Skipping acquiring lock for event (subject=${event.subject}) as the resource does not required locking.`,
        },
        span,
      );
      return 'NOOP';
    }

    try {
      logToSpan({
        level: 'INFO',
        message: 'Acquiring lock for the event',
      });
      const acquired = await this.memory.lock(event.subject);
      return acquired ? 'ACQUIRED' : 'NOT_ACQUIRED';
    } catch (e) {
      throw new TransactionViolation({
        cause: TransactionViolationCause.LOCK_FAILURE,
        message: `Error acquiring lock for event (subject=${event.subject}): ${(e as Error)?.message}`,
        initiatingEvent: event,
      });
    }
  }

  /**
   * Retrieves the current state from memory for the given event subject.
   *
   * This method reads the persisted memory object associated with the event's subject
   * from the distributed storage system. If no memory exists for the subject, it returns null.
   * The operation is wrapped in proper error handling to ensure transaction safety across
   * distributed service instances.
   *
   * @returns A promise that resolves to the memory object if found, or null if no memory exists
   *
   * @throws {TransactionViolation} When the read operation fails due to storage errors
   */
  public async acquireState(event: ArvoEvent, span?: Span): Promise<T | null> {
    try {
      logToSpan(
        {
          level: 'INFO',
          message: 'Reading machine state for the event',
        },
        span,
      );
      return await this.memory.read(event.subject);
    } catch (e) {
      throw new TransactionViolation({
        cause: TransactionViolationCause.READ_FAILURE,
        message: `Error reading state for event (subject=${event.subject}): ${(e as Error)?.message}`,
        initiatingEvent: event,
      });
    }
  }

  /**
   * Persists the updated memory state to distributed storage.
   *
   * This method writes the new memory record to the distributed storage system, associating
   * it with the event's subject. It provides both the new record and the previous record for
   * implementations that need to perform atomic updates, maintain audit trails, or handle
   * optimistic concurrency control in distributed environments.
   *
   * @throws {TransactionViolation} When the write operation fails due to storage errors
   */
  public async persistState(event: ArvoEvent, record: T, prevRecord: T | null, span?: Span) {
    try {
      logToSpan(
        {
          level: 'INFO',
          message: 'Persisting machine state to the storage',
        },
        span,
      );
      await this.memory.write(event.subject, record, prevRecord);
    } catch (e) {
      throw new TransactionViolation({
        cause: TransactionViolationCause.WRITE_FAILURE,
        message: `Error writing state for event (subject=${event.subject}): ${(e as Error)?.message}`,
        initiatingEvent: event,
      });
    }
  }

  /**
   * Validates that the event subject conforms to the ArvoOrchestrationSubject format.
   *
   * This method ensures that the event subject follows the expected schema format
   * required by the Arvo orchestration system. Invalid subjects will result in
   * execution violations to prevent processing of malformed events across the
   * distributed service architecture.
   *
   * @throws {ExecutionViolation} When the event subject format is invalid
   *
   * @protected
   */
  public validateEventSubject(event: ArvoEvent, span?: Span) {
    logToSpan(
      {
        level: 'INFO',
        message: 'Validating event subject',
      },
      span,
    );
    const isValid = ArvoOrchestrationSubject.isValid(event.subject);
    if (!isValid) {
      throw new ExecutionViolation(
        `Invalid event (id=${event.id}) subject format. Expected an ArvoOrchestrationSubject but received '${event.subject}'. The subject must follow the format specified by ArvoOrchestrationSubject schema`,
      );
    }
  }

  /**
   * Releases a previously acquired lock on the event subject.
   *
   * This method safely releases locks that were acquired during event processing to prevent
   * resource leaks in distributed systems. It handles cases where no lock was acquired
   * (NOOP operations) and provides proper error handling for unlock failures. Failed unlock
   * operations are logged as potential resource leaks but do not throw exceptions to avoid
   * disrupting the main processing flow as it assumes that the lock will have the lifedspan.
   *
   * @returns A promise that resolves to the lock release status:
   *          - 'NOOP': No lock was acquired, so no operation was performed
   *          - 'RELEASED': Lock was successfully released
   *          - 'ERROR': Lock release failed, potential resource leak
   *
   * @protected
   */
  public async releaseLock(
    event: ArvoEvent,
    acquiredLock: AcquiredLockStatusType | null,
    span?: Span,
  ): Promise<ReleasedLockStatusType> {
    if (acquiredLock !== 'ACQUIRED') {
      logToSpan(
        {
          level: 'INFO',
          message: 'Lock was not acquired by the process so perfroming no operation',
        },
        span,
      );
      return 'NOOP';
    }
    try {
      await this.memory.unlock(event.subject);
      logToSpan(
        {
          level: 'INFO',
          message: 'Lock successfully released',
        },
        span,
      );
      return 'RELEASED';
    } catch (err) {
      logToSpan(
        {
          level: 'ERROR',
          message: `Memory unlock operation failed - Possible resource leak: ${(err as Error).message}`,
        },
        span,
      );
      return 'ERROR';
    }
  }
}
