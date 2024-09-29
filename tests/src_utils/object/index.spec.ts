import { getAllPaths, pathValueToString, PathValue } from '../../../src/utils/object'; // Adjust the import path as needed

describe('getAllPaths', () => {
  it('should return correct paths for a simple object', () => {
    const obj = { a: { b: 1 }, c: 2 };
    const result = getAllPaths(obj);
    expect(result).toEqual([
      { path: ['c'], value: 2 },
      { path: ['a', 'b'], value: 1 },
    ]);
  });

  it('should handle nested objects', () => {
    const obj = { a: { b: { c: 1 } }, d: 2 };
    const result = getAllPaths(obj);
    expect(result).toEqual([
      { path: ['d'], value: 2 },
      { path: ['a', 'b', 'c'], value: 1 },
    ]);
  });

  it('should handle arrays', () => {
    const obj = { a: [1, 2, 3], b: 4 };
    const result = getAllPaths(obj);
    expect(result).toEqual([
      { path: ['b'], value: 4 },
      { path: ['a', '2'], value: 3 },
      { path: ['a', '1'], value: 2 },
      { path: ['a', '0'], value: 1 },
    ]);
  });

  it('should handle null values', () => {
    const obj = { a: null, b: 2 };
    const result = getAllPaths(obj);
    expect(JSON.stringify(result)).toEqual(JSON.stringify([
      { path: ['b'], value: 2 },
      { path: ['a'], value: null },
    ]));
  });

  it('should throw an error for invalid input', () => {
    expect(() => getAllPaths(null as any)).toThrow(Error);
    expect(() => getAllPaths(undefined as any)).toThrow(Error);
    expect(() => getAllPaths(42 as any)).toThrow(Error);
  });
});

describe('pathValueToString', () => {
  it('should convert a simple PathValue to string', () => {
    const pathValue: PathValue = { path: ['a', 'b'], value: 1 };
    const result = pathValueToString(pathValue);
    expect(result).toBe('#a.#b.1');
  });

  it('should handle PathValue with empty path', () => {
    const pathValue: PathValue = { path: [], value: 'test' };
    const result = pathValueToString(pathValue);
    expect(result).toBe('test');
  });

  it('should handle PathValue with null value', () => {
    const pathValue: PathValue = { path: ['a'], value: null };
    const result = pathValueToString(pathValue);
    expect(result).toBe('#a.null');
  });

  it('should handle PathValue with undefined value', () => {
    const pathValue: PathValue = { path: ['a', 'b'], value: undefined };
    const result = pathValueToString(pathValue);
    expect(result).toBe('#a.#b.undefined');
  });
});