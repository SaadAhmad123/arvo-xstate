/**
 * Manages machine state memory operations with optimistic locking strategy.
 * Implements a "fail fast on acquire, be tolerant on release" approach for resource management.
 * @template T - Structure of stored data
 */
export interface IMachineMemory<T extends Record<string, any>> {
  /**
   * Gets state data for machine ID (event.subject).
   * Should implement minimal retries (e.g. 2-3 attempts) with backoff for transient failures.
   * Must distinguish between:
   * - No data exists: Returns null (normal case for new machines)
   * - Operation failed: Throws error after all retries exhausted
   *
   * Retry strategy should be quick with reasonable timeout to avoid blocking:
   * - Few retry attempts (2-3)
   * - Short backoff delays (e.g. 100ms with exponential backoff)
   * - Total operation time under 1s
   *
   * @param id - Machine ID
   * @returns null if no data exists, T if data found
   * @throws Error if read operation fails after retries (e.g. connection error, permission denied)
   */
  read(id: string): Promise<T | null>;

  /**
   * Saves state data for machine ID (event.subject).
   * Should fail fast - if write fails, throw error immediately.
   * No retry logic as consistency is critical and caller handles failures.
   * @param id - Machine ID
   * @param data - State to save
   * @param prevData - The previous snapshot of the data
   * @throws Error if write operation fails
   */
  write(id: string, data: T, prevData: T | null): Promise<void>;

  /**
   * Acquires execution lock for machine ID (event.subject).
   * Should implement reasonable retries with backoff for transient lock conflicts.
   * Must fail fast after retry attempts exhausted - no long polling.
   * @param id - Machine ID
   * @returns True if lock acquired successfully
   * @throws Error if lock operation fails (not same as lock denial)
   */
  lock(id: string): Promise<boolean>;

  /**
   * Releases execution lock for machine ID (event.subject).
   * Can retry a few times on failure but should not over-engineer.
   * System will eventually recover even if unlock fails.
   *
   * Implementation MUST include lock expiry mechanism (TTL):
   * - Set reasonable TTL when acquiring lock (e.g. 30s-5m based on execution patterns)
   * - Ensure locks auto-expire to prevent deadlocks from unlock failures
   * - Consider execution patterns when setting TTL to avoid premature expiry
   *
   * @param id - Machine ID
   * @returns True if unlocked successfully
   */
  unlock(id: string): Promise<boolean>;
}
