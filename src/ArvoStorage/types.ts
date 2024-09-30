import { z } from "zod";

/**
 * Interface for managing access locks.
 *
 * This interface provides methods for acquiring and releasing locks, ensuring
 * controlled access to resources. It can be used independently of the storage manager.
 */
export interface ILockingManager {
  /**
   * Attempts to acquire a lock on the specified path.
   *
   * @param path - The path to acquire a lock on.
   * @returns A promise resolving to true if the lock is acquired, false otherwise.
   */
  acquireLock(path: string): Promise<boolean>;

  /**
   * Releases a lock on the specified path.
   *
   * @param path - The path to release the lock from.
   * @returns A promise resolving to true if the lock is successfully released, false otherwise.
   */
  releaseLock(path: string): Promise<boolean>;

  /**
   * Checks if a lock is currently held on the specified path.
   *
   * @param path - The path to check for a lock.
   * @returns A promise resolving to a boolean indicating if the path is locked.
   */
  isLocked(path: string): Promise<boolean>;
}

/**
 * Interface for managing storage operations.
 *
 * This interface abstracts the basic functionalities for storage operations
 * including writing, reading, deleting, and existence checks of data in a storage medium.
 * It uses a generic type parameter to ensure type safety of the stored data.
 *
 * @typeParam TDataSchema - A Zod schema type representing the structure of the data to be stored.
 */
export interface IStorageManager<TDataSchema extends z.ZodTypeAny> {
  /**
   * Writes data to a specified storage path.
   *
   * @param data - The data to write, conforming to the specified schema.
   * @param path - The target path for storing the data.
   * @returns A promise that resolves once the write operation is complete.
   */
  write(data: z.infer<TDataSchema>, path: string): Promise<void>;

  /**
   * Reads data from a specified storage path.
   *
   * @param path - The path from which to read the data.
   * @param defaultValue - The default value to return if the data is not found.
   * @returns A promise resolving to the read data or the provided default value.
   */
  read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null
  ): Promise<z.infer<TDataSchema> | null>;

  /**
   * Deletes data from a specified storage path.
   *
   * @param path - The path from which to delete the data.
   * @returns A promise that resolves once the delete operation is complete.
   */
  delete(path: string): Promise<void>;

  /**
   * Checks the existence of data at a specified storage path.
   *
   * @param path - The path to check for data existence.
   * @returns A promise resolving to a boolean indicating if the data exists.
   */
  exists(path: string): Promise<boolean>;
}

/**
 * Interface defining the structure for input parameters of ArvoStorage.
 *
 * @typeParam TDataSchema - A Zod schema type representing the structure of the data to be stored.
 */
export interface IArvoStorage<TDataSchema extends z.ZodTypeAny> {
  /**
   * The schema of the data represented by a Zod object.
   * This schema is used to validate the data structure during operations.
   */
  schema: TDataSchema;

  /**
   * IStorageManager instance for storage operations.
   * This manager handles the actual storage and retrieval of data.
   */
  storageManager: IStorageManager<TDataSchema>;

  /**
   * Optional ILockingManager instance for lock management.
   * If provided, this manager handles locking mechanisms to ensure data integrity
   * in concurrent environments.
   */
  lockingManager?: ILockingManager;
}