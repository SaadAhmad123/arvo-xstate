import { z } from 'zod';
import { objectToBase64, base64ToObject } from '../../src'; // Adjust the import path as needed

// Mock the 'arvo-core' and 'zlib' modules
jest.mock('arvo-core', () => ({
  cleanString: jest.fn((str) => str.replace(/\s+/g, ' ').trim()),
}));

jest.mock('zlib', () => ({
  deflateSync: jest.fn((buffer) => Buffer.from(`compressed_${buffer.toString()}`)),
  inflateSync: jest.fn((buffer) => Buffer.from(buffer.toString().replace('compressed_', ''))),
}));

describe('Base64 Utility Functions', () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number(),
    isStudent: z.boolean(),
  });

  describe('objectToBase64', () => {
    it('should convert a valid object to a base64 string', () => {
      const testObject = { name: 'John Doe', age: 30, isStudent: false };
      const result = objectToBase64(testSchema, testObject);
      expect(result).toBe('Y29tcHJlc3NlZF97Im5hbWUiOiJKb2huIERvZSIsImFnZSI6MzAsImlzU3R1ZGVudCI6ZmFsc2V9');
    });

    it('should throw an error for invalid object', () => {
      const invalidObject = { name: 'John Doe', age: '30', isStudent: false };
      expect(() => objectToBase64(testSchema, invalidObject as any)).toThrow();
    });

    it('should handle empty objects', () => {
      const emptySchema = z.object({});
      const emptyObject = {};
      const result = objectToBase64(emptySchema, emptyObject);
      expect(result).toBe('Y29tcHJlc3NlZF97fQ==');
    });

    it('should handle complex nested objects', () => {
      const complexSchema = z.object({
        user: z.object({
          name: z.string(),
          contacts: z.array(z.string()),
        }),
        metadata: z.record(z.string()),
      });
      const complexObject = {
        user: { name: 'Alice', contacts: ['email', 'phone'] },
        metadata: { lastLogin: '2023-01-01' },
      };
      expect(() => objectToBase64(complexSchema, complexObject)).not.toThrow();
    });
  });

  describe('base64ToObject', () => {
    it('should convert a valid base64 string to an object', () => {
      const base64String = 'Y29tcHJlc3NlZF97Im5hbWUiOiJKb2huIERvZSIsImFnZSI6MzAsImlzU3R1ZGVudCI6ZmFsc2V9';
      const result = base64ToObject(testSchema, base64String);
      expect(result).toEqual({ name: 'John Doe', age: 30, isStudent: false });
    });

    it('should throw an error for invalid base64 string', () => {
      const invalidBase64 = 'invalid_base64_string';
      expect(() => base64ToObject(testSchema, invalidBase64)).toThrow();
    });

    it('should throw an error if decompressed data does not match schema', () => {
      const invalidDataBase64 = 'Y29tcHJlc3NlZF97Im5hbWUiOiJKb2huIERvZSIsImFnZSI6IjMwIiwiaXNTdHVkZW50IjpmYWxzZX0=';
      expect(() => base64ToObject(testSchema, invalidDataBase64)).toThrow();
    });

    it('should handle empty objects', () => {
      const emptySchema = z.object({});
      const emptyObjectBase64 = 'Y29tcHJlc3NlZF97fQ==';
      const result = base64ToObject(emptySchema, emptyObjectBase64);
      expect(result).toEqual({});
    });
  });

  describe('Round-trip conversion', () => {
    it('should correctly round-trip an object through base64 and back', () => {
      const originalObject = { name: 'Jane Smith', age: 25, isStudent: true };
      const base64 = objectToBase64(testSchema, originalObject);
      const roundTrippedObject = base64ToObject(testSchema, base64);
      expect(roundTrippedObject).toEqual(originalObject);
    });
  });
});