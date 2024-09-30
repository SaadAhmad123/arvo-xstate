import { ArvoXStateTracer } from '../OpenTelemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import { exceptionToSpan } from 'arvo-core';
import { z } from 'zod';
import { IArvoStorage, ILockingManager, IStorageManager } from './types';

/**
 * ArvoStorage class provides a high-level interface for storage operations with built-in
 * schema validation, locking mechanisms, and OpenTelemetry tracing.
 *
 * @template TDataSchema - A Zod schema type representing the structure of the data to be stored.
 */
export default class ArvoStorage<TDataSchema extends z.ZodTypeAny> {
  
  /**
   * The Zod schema used for data validation.
   */
  public readonly schema: TDataSchema;

  /**
   * The storage manager responsible for data persistence operations.
   */
  private readonly storageManager: IStorageManager<TDataSchema>

  /**
   * The optional locking manager for concurrency control.
   */
  private readonly lockingManager: ILockingManager | null

  /**
   * Creates an instance of ArvoStorage.
   *
   * @param params - Configuration parameters for ArvoStorage.
   */
  constructor(params: IArvoStorage<TDataSchema>) {
    this.schema = params.schema
    this.storageManager = params.storageManager
    this.lockingManager = params.lockingManager ?? null
  }

  /**
   * Reads data from the specified path.
   *
   * @param path - The path to read data from.
   * @param __default - The default value to return if no data is found.
   * @returns A promise that resolves to the read data or the default value.
   */
  async read(
    path: string,
    __default: z.infer<TDataSchema> | null = null,
  ): Promise<z.infer<TDataSchema> | null> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.read',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          let result = await this.storageManager.read(path, __default);
          if (result !== null) {
            result = this.schema.parse(result)
          }

          span.setAttributes({
            'arvo.storage.read.success': true,
            'arvo.storage.read.data_length': result ? JSON.stringify(result).length : 0,
          });

          span.setStatus({ code: SpanStatusCode.OK });          
          return result;
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.read.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Writes data to the specified path.
   *
   * @param data - The data to write, conforming to the specified schema.
   * @param path - The path to write the data to.
   * @returns A promise that resolves when the write operation is complete.
   */
  async write(data: z.infer<TDataSchema>, path: string): Promise<void> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.write',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
          'arvo.storage.data_length': JSON.stringify(data).length,
        });

        try {
          const dataToWrite: z.infer<TDataSchema> = this.schema.parse(data)
          await this.storageManager.write(dataToWrite, path);

          span.setAttributes({
            'arvo.storage.write.success': true,
          });

          span.setStatus({ code: SpanStatusCode.OK });
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.write.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Deletes data from the specified path.
   *
   * @param path - The path from which to delete data.
   * @returns A promise that resolves when the delete operation is complete.
   * @throws Error if the storageManager encounters an issue during deletion.
   */
  async delete(path: string): Promise<void> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.delete',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          await this.storageManager.delete(path);
          span.setAttributes({
            'arvo.storage.delete.success': true,
          });
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.delete.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Checks for the existence of data at the specified path.
   *
   * @param path - The path to check for data existence.
   * @returns A promise resolving to a boolean indicating if the data exists.
   * @throws Error if the storageManager encounters an issue during the check.
   */
  async exists(path: string): Promise<boolean> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.exists',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          const result = await this.storageManager.exists(path);
          span.setAttributes({
            'arvo.storage.exists.success': true,
            'arvo.storage.exists.result': result,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.exists.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Attempts to acquire a lock on the specified path.
   *
   * @param path - The path to acquire a lock on.
   * @returns A promise resolving to true if the lock is acquired, false otherwise.
   * @throws Error if the lockingManager is not defined or an error is thrown during execution.
   */
  async acquireLock(path: string): Promise<boolean> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.acquireLock',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          if (!this.lockingManager) {
            throw new Error(
              `[ArvoStorage][acquireLock] Trying to use locking manager which does not exist.`,
            );
          }
          const result = await this.lockingManager.acquireLock(path);
          span.setAttributes({
            'arvo.storage.lock.acquire.success': true,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.lock.acquire.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Releases a lock on the specified path.
   *
   * @param path - The path to release the lock from.
   * @returns A promise resolving to true if the lock is released successfully, false otherwise.
   * @throws Error if the lockingManager is not defined or an error is thrown during execution.
   */
  async releaseLock(path: string): Promise<boolean> {
    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.releaseLock',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          if (!this.lockingManager) {
            throw new Error(
              `[ArvoStorage][releaseLock] Trying to use locking manager which does not exist.`,
            );
          }
          const result = await this.lockingManager.releaseLock(path);
          span.setAttributes({
            'arvo.storage.lock.release.success': true,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.lock.release.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Checks if a lock is currently held on the specified path.
   *
   * @param path - The path to check for a lock.
   * @returns A promise resolving to a boolean indicating if the path is locked.
   * @throws Error if the lockingManager is not defined or an error is thrown during execution.
   */
  async isLocked(path: string): Promise<boolean> {

    return await ArvoXStateTracer.startActiveSpan(
      'ArvoStorage.isLocked',
      async (span) => {
        span.setAttributes({
          'arvo.storage.path': path,
        });

        try {
          if (!this.lockingManager) {
            throw new Error(
              `[ArvoStorage][isLocked] Trying to use locking manager which does not exist.`,
            );
          }
          const result = await this.lockingManager.isLocked(path);
          span.setAttributes({
            'arvo.storage.lock.check.success': true,
            'arvo.storage.lock.check.status': result ? 'locked' : 'unlocked'
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
          span.setAttributes({
            'arvo.storage.lock.check.success': false,
          });
          exceptionToSpan(e as Error, span);
          throw e;
        } finally {
          span.end();
        }
      },
    );
  }
}