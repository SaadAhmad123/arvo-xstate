import { z } from 'zod';
import { IStorageManager, ILockingManager, ArvoStorage } from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';

// Mock implementations
const mockStorageManager: jest.Mocked<IStorageManager<any>> = {
  read: jest.fn(),
  write: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
};

const mockLockingManager: jest.Mocked<ILockingManager> = {
  acquireLock: jest.fn(),
  releaseLock: jest.fn(),
  isLocked: jest.fn(),
};

// Define a schema for testing
const TestSchema = z.object({
  id: z.number(),
  name: z.string(),
});

describe('ArvoStorage', () => {
  let arvoStorage: ArvoStorage<typeof TestSchema>;

  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    arvoStorage = new ArvoStorage({
      schema: TestSchema,
      storageManager: mockStorageManager,
      lockingManager: mockLockingManager,
    });
  });

  describe('read', () => {
    it('should read and validate data successfully', async () => {
      const testData = { id: 1, name: 'Test' };
      mockStorageManager.read.mockResolvedValue(testData);

      const result = await arvoStorage.read('test/path');

      expect(result).toEqual(testData);
      expect(mockStorageManager.read).toHaveBeenCalledWith('test/path', null);
    });

    it('should return null for non-existent data', async () => {
      mockStorageManager.read.mockResolvedValue(null);

      const result = await arvoStorage.read('test/path');

      expect(result).toBeNull();
    });

    it('should throw an error for invalid data', async () => {
      const invalidData = { id: 'invalid', name: 123 };
      mockStorageManager.read.mockResolvedValue(invalidData);

      await expect(arvoStorage.read('test/path')).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('should write valid data successfully', async () => {
      const testData = { id: 1, name: 'Test' };

      await arvoStorage.write(testData, 'test/path');

      expect(mockStorageManager.write).toHaveBeenCalledWith(testData, 'test/path');
    });

    it('should throw an error for invalid data', async () => {
      const invalidData = { id: 'invalid', name: 123 };

      await expect(arvoStorage.write(invalidData as any, 'test/path')).rejects.toThrow();
      expect(mockStorageManager.write).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete data successfully', async () => {
      await arvoStorage.delete('test/path');

      expect(mockStorageManager.delete).toHaveBeenCalledWith('test/path');
    });
  });

  describe('exists', () => {
    it('should check existence successfully', async () => {
      mockStorageManager.exists.mockResolvedValue(true);

      const result = await arvoStorage.exists('test/path');

      expect(result).toBe(true);
      expect(mockStorageManager.exists).toHaveBeenCalledWith('test/path');
    });
  });

  describe('locking operations', () => {
    it('should acquire lock successfully', async () => {
      mockLockingManager.acquireLock.mockResolvedValue(true);

      const result = await arvoStorage.acquireLock('test/path');

      expect(result).toBe(true);
      expect(mockLockingManager.acquireLock).toHaveBeenCalledWith('test/path');
    });

    it('should release lock successfully', async () => {
      mockLockingManager.releaseLock.mockResolvedValue(true);

      const result = await arvoStorage.releaseLock('test/path');

      expect(result).toBe(true);
      expect(mockLockingManager.releaseLock).toHaveBeenCalledWith('test/path');
    });

    it('should check lock status successfully', async () => {
      mockLockingManager.isLocked.mockResolvedValue(true);

      const result = await arvoStorage.isLocked('test/path');

      expect(result).toBe(true);
      expect(mockLockingManager.isLocked).toHaveBeenCalledWith('test/path');
    });

    it('should throw an error when locking manager is not defined', async () => {
      const arvoStorageWithoutLocking = new ArvoStorage({
        schema: TestSchema,
        storageManager: mockStorageManager,
      });

      await expect(arvoStorageWithoutLocking.acquireLock('test/path')).rejects.toThrow();
      await expect(arvoStorageWithoutLocking.releaseLock('test/path')).rejects.toThrow();
      await expect(arvoStorageWithoutLocking.isLocked('test/path')).rejects.toThrow();
    });
  });
});