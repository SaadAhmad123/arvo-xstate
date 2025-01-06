/**
 * Manages machine state memory operations for reading, writing and locking.
 * The mindset while implementing the locking strategy must be "fail fast on acquire, be tolerant on release"
 * @template T - Structure of stored data
 */
export interface IMachineMemory<T extends Record<string, any>> {
  /**
   * Gets state data for machine ID.
   * @param id - Machine ID
   * @throws If read fails
   */
  read(id: string): Promise<T | null>;

  /**
   * Saves state data for machine ID.
   * @param id - Machine ID
   * @param data - State to save
   * @throws If write fails
   */
  write(id: string, data: T): Promise<void>;

  /**
   * Acquires execution lock for machine ID.
   * @param id - Machine ID
   * @returns True if locked successfully
   */
  lock(id: string): Promise<boolean>;

  /**
   * Releases execution lock for machine ID.
   * @param id - Machine ID
   * @returns True if unlocked successfully
   */
  unlock(id: string): Promise<boolean>;
}
