import type { MachineMemoryRecord } from '../ArvoOrchestrator/types';
import type { IMachineMemory } from './interface';

/**
 * In-memory implementation of machine state storage for single-instance NodeJS apps.
 *
 * Best for: Container apps, request-scoped workflows, testing, demos
 * Not for: Multi-instance deployments, persistent workflows, distributed systems
 *
 * @example
 * const memory = new SimpleMachineMemory();
 * const orchestrator = createArvoOrchestrator({
 *   memory,
 *   executionunits: 1,
 *   machines: [workflow]
 * });
 */
export class SimpleMachineMemory implements IMachineMemory<MachineMemoryRecord> {
  private readonly memoryMap: Map<string, MachineMemoryRecord> = new Map();
  private readonly lockMap: Map<string, boolean> = new Map();

  /**
   * Gets stored state for a machine instance
   * @param id Machine instance ID
   * @returns State data or null if not found
   * @throws {Error} When id is empty or undefined
   */
  async read(id: string): Promise<MachineMemoryRecord | null> {
    if (!id) {
      throw new Error('Machine ID is required for read operation');
    }
    return this.memoryMap.get(id) ?? null;
  }

  /**
   * Stores state for a machine instance
   * @param id Machine instance ID
   * @param data State to store
   * @throws {Error} When id is empty/undefined or data is null/undefined
   */
  async write(id: string, data: MachineMemoryRecord): Promise<void> {
    if (!id) {
      throw new Error('Machine ID is required for write operation');
    }
    if (!data) {
      throw new Error('Data is required for write operation');
    }
    this.memoryMap.set(id, { ...data });
  }

  /**
   * Attempts to acquire lock for machine instance
   * @param id Machine instance ID
   * @returns Success status of lock acquisition
   * @throws {Error} When id is empty or undefined
   */
  async lock(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('Machine ID is required for lock operation');
    }
    if (this.lockMap.get(id)) {
      return false;
    }
    this.lockMap.set(id, true);
    return true;
  }

  /**
   * Releases lock for machine instance
   * @param id Machine instance ID
   * @returns True when lock is released
   * @throws {Error} When id is empty or undefined
   */
  async unlock(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('Machine ID is required for unlock operation');
    }
    this.lockMap.delete(id);
    return true;
  }

  /**
   * Clears all stored data and locks
   */
  clear(): void {
    this.memoryMap.clear();
    this.lockMap.clear();
  }
}
