import { type MachineMemoryRecord, SimpleMachineMemory } from '../../src';

describe('SimpleMachineMemory', () => {
  let memory: SimpleMachineMemory;
  let validData: MachineMemoryRecord;

  beforeEach(() => {
    memory = new SimpleMachineMemory();
    validData = {
      initEventId: '',
      subject: 'test',
      state: {} as any,
      parentSubject: null,
      status: 'active',
      value: '',
      machineDefinition: null,
      events: {
        consumed: null,
        produced: {},
      },
    };
  });

  describe('write', () => {
    it('should throw error when writing with empty id', async () => {
      await expect(memory.write('', validData)).rejects.toThrow('Machine ID is required for write operation');
    });

    it('should throw error when writing undefined data', async () => {
      await expect(memory.write('test', undefined as any)).rejects.toThrow('Data is required for write operation');
    });

    it('should throw error when writing null data', async () => {
      await expect(memory.write('test', null as any)).rejects.toThrow('Data is required for write operation');
    });

    it('should successfully write valid data', async () => {
      await expect(memory.write('test', validData)).resolves.not.toThrow();
    });

    it('should create a copy of the data when writing', async () => {
      await memory.write('test', validData);
      validData.value = 'modified';
      const stored = await memory.read('test');
      expect(stored?.value).toBe('');
    });
  });

  describe('read', () => {
    it('should throw error when reading with empty id', async () => {
      await expect(memory.read('')).rejects.toThrow('Machine ID is required for read operation');
    });

    it('should return null for non-existent id', async () => {
      const result = await memory.read('nonexistent');
      expect(result).toBeNull();
    });

    it('should return stored data for existing id', async () => {
      await memory.write('test', validData);
      const result = await memory.read('test');
      expect(result).toEqual(validData);
    });
  });

  describe('lock', () => {
    it('should throw error when locking with empty id', async () => {
      await expect(memory.lock('')).rejects.toThrow('Machine ID is required for lock operation');
    });

    it('should successfully acquire lock for new id', async () => {
      const result = await memory.lock('test');
      expect(result).toBe(true);
    });

    it('should fail to acquire lock for already locked id', async () => {
      await memory.lock('test');
      const result = await memory.lock('test');
      expect(result).toBe(false);
    });
  });

  describe('unlock', () => {
    it('should throw error when unlocking with empty id', async () => {
      await expect(memory.unlock('')).rejects.toThrow('Machine ID is required for unlock operation');
    });

    it('should successfully unlock locked id', async () => {
      await memory.lock('test');
      const result = await memory.unlock('test');
      expect(result).toBe(true);
    });

    it('should successfully unlock non-locked id', async () => {
      const result = await memory.unlock('test');
      expect(result).toBe(true);
    });

    it('should allow locking after unlock', async () => {
      await memory.lock('test');
      await memory.unlock('test');
      const result = await memory.lock('test');
      expect(result).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all stored data', async () => {
      await memory.write('test1', validData);
      await memory.write('test2', validData);
      await memory.lock('test3');

      memory.clear();

      const data1 = await memory.read('test1');
      const data2 = await memory.read('test2');
      const canLock3 = await memory.lock('test3');

      expect(data1).toBeNull();
      expect(data2).toBeNull();
      expect(canLock3).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should handle write-read-lock-unlock cycle', async () => {
      // Write data
      await memory.write('test', validData);

      // Read data
      const readData = await memory.read('test');
      expect(readData).toEqual(validData);

      // Lock
      const locked = await memory.lock('test');
      expect(locked).toBe(true);

      // Try to lock again
      const lockedAgain = await memory.lock('test');
      expect(lockedAgain).toBe(false);

      // Unlock
      const unlocked = await memory.unlock('test');
      expect(unlocked).toBe(true);

      // Should be able to lock again
      const lockedAfterUnlock = await memory.lock('test');
      expect(lockedAfterUnlock).toBe(true);
    });
  });
});
