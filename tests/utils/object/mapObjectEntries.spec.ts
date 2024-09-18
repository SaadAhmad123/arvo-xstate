import mapObjectEntries from '../../../src/utils/object/mapObjectEntries';

describe('mapObjectEntries', () => {
  it('should transform object keys and values', () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = mapObjectEntries(input, ({ key, value }) => [key.toUpperCase(), value * 2]);
    expect(result).toEqual({ A: 2, B: 4, C: 6 });
  });

  it('should handle empty objects', () => {
    const input = {};
    const result = mapObjectEntries(input, ({ key, value }) => [key, value]);
    expect(result).toEqual({});
  });

  it('should provide correct index in callback', () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = mapObjectEntries(input, ({ key, value, index }) => [key, index]);
    expect(result).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('should provide access to the original object in callback', () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = mapObjectEntries(input, ({ key, self }) => [key, Object.keys(self).length]);
    expect(result).toEqual({ a: 3, b: 3, c: 3 });
  });

  it('should allow changing key names', () => {
    const input = { firstName: 'John', lastName: 'Doe' };
    const result = mapObjectEntries(input, ({ key, value }) => [`${key}Name`, value.toUpperCase()]);
    expect(result).toEqual({ firstNameName: 'JOHN', lastNameName: 'DOE' });
  });

  it('should handle different input and output types', () => {
    const input = { a: '1', b: '2', c: '3' };
    const result = mapObjectEntries<string, number>(input, ({ key, value }) => [key, parseInt(value, 10)]);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('should maintain the order of properties', () => {
    const input = { z: 1, y: 2, x: 3 };
    const result = mapObjectEntries(input, ({ key, value }) => [key, value]);
    const keys = Object.keys(result);
    expect(keys).toEqual(['z', 'y', 'x']);
  });
});