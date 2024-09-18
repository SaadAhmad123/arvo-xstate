import filterTruthyValues from '../../../src/utils/object/filterTruthyValues'

describe('filterTruthyValues', () => {
  it('should return an empty object when given an empty object', () => {
    expect(filterTruthyValues({})).toEqual({});
  });

  it('should filter out falsy values', () => {
    const input = {
      a: 1,
      b: '',
      c: null,
      d: 'hello',
      e: 0,
      f: false,
      g: undefined,
      h: NaN,
    };
    const expected = {
      a: 1,
      d: 'hello',
    };
    expect(filterTruthyValues(input)).toEqual(expected);
  });

  it('should keep truthy values', () => {
    const input = {
      a: 1,
      b: 'string',
      c: true,
      d: [],
      e: {},
      f: () => {},
    };
    expect(filterTruthyValues(input)).toEqual(input);
  });

  it('should handle objects with only falsy values', () => {
    const input = {
      a: null,
      b: undefined,
      c: false,
      d: '',
      e: 0,
      f: NaN,
    };
    expect(filterTruthyValues(input)).toEqual({});
  });

  it('should handle objects with nested structures', () => {
    const input = {
      a: { nested: 'value' },
      b: [1, 2, 3],
      c: null,
    };
    const expected = {
      a: { nested: 'value' },
      b: [1, 2, 3],
    };
    expect(filterTruthyValues(input)).toEqual(expected);
  });

  it('should preserve the original object type', () => {
    interface TestType {
      a?: number;
      b?: string;
      c?: boolean;
    }
    const input: TestType = {
      a: 1,
      b: '',
      c: true,
    };
    const result = filterTruthyValues(input);
    expect(result).toEqual({ a: 1, c: true });
    // TypeScript type check (this will fail if the types don't match)
    const _: TestType = result;
  });
});