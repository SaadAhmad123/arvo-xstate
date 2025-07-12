import { SpanKind } from '@opentelemetry/api';
import { ArvoOpenTelemetry } from 'arvo-core';
import type { IMachineMemory } from './interface';
import { getJsonSize } from './utils';

/**
 * A telemetred In-memory implementation of machine state storage for single-instance NodeJS apps.
 *
 * Best for: Container apps, request-scoped workflows, testing, demos
 * Not for: Multi-instance deployments, persistent workflows, distributed systems
 *
 * @example
 * const memory = new TelemetredSimpleMachineMemory();
 * const orchestrator = createArvoOrchestrator({
 *   memory,
 *   executionunits: 0.1,
 *   machines: [workflow]
 * });
 */
export class TelemetredSimpleMachineMemory<T extends Record<string, any> = Record<string, any>>
  implements IMachineMemory<T>
{
  private readonly memoryMap: Map<string, T> = new Map();
  private readonly lockMap: Map<string, boolean> = new Map();

  /**
   * Gets stored state for a machine instance
   * @param id Machine instance ID
   * @returns State data or null if not found
   * @throws {Error} When id is empty or undefined
   */
  async read(id: string): Promise<T | null> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'Read Simple Memory',
      spanOptions: {
        kind: SpanKind.INTERNAL,
        attributes: {
          'arvo.memory.id': id,
        },
      },
      fn: async () => {
        if (!id) {
          throw new Error('Machine ID is required for read operation');
        }
        return this.memoryMap.get(id) ?? null;
      },
    });
  }

  /**
   * Stores state for a machine instance
   * @param id Machine instance ID
   * @param data State to store
   * @throws {Error} When id is empty/undefined or data is null/undefined
   */
  async write(id: string, data: T): Promise<void> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'Write Simple Memory',
      spanOptions: {
        kind: SpanKind.INTERNAL,
        attributes: {
          'arvo.memory.id': id,
          'arvo.memory.record.bytes': data ? getJsonSize(data) : 0,
        },
      },
      fn: async () => {
        if (!id) {
          throw new Error('Machine ID is required for write operation');
        }
        if (!data) {
          throw new Error('Data is required for write operation');
        }
        this.memoryMap.set(id, { ...data });
      },
    });
  }

  /**
   * Attempts to acquire lock for machine instance
   * @param id Machine instance ID
   * @returns Success status of lock acquisition
   * @throws {Error} When id is empty or undefined
   */
  async lock(id: string): Promise<boolean> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'Lock Simple Memory',
      spanOptions: {
        kind: SpanKind.INTERNAL,
        attributes: {
          'arvo.memory.id': id,
        },
      },
      fn: async () => {
        if (!id) {
          throw new Error('Machine ID is required for lock operation');
        }
        if (this.lockMap.get(id)) {
          return false;
        }
        this.lockMap.set(id, true);
        return true;
      },
    });
  }

  /**
   * Releases lock for machine instance
   * @param id Machine instance ID
   * @returns True when lock is released
   * @throws {Error} When id is empty or undefined
   */
  async unlock(id: string): Promise<boolean> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'Unlock Simple Memory',
      spanOptions: {
        kind: SpanKind.INTERNAL,
        attributes: {
          'arvo.memory.id': id,
        },
      },
      fn: async () => {
        if (!id) {
          throw new Error('Machine ID is required for unlock operation');
        }
        this.lockMap.delete(id);
        return true;
      },
    });
  }

  /**
   * Clears all stored data and locks
   */
  clear(key?: string): void {
    if (key) {
      this.memoryMap.delete(key);
      this.lockMap.delete(key);
      return;
    }
    this.memoryMap.clear();
    this.lockMap.clear();
  }
}
