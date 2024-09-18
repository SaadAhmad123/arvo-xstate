/**
 * Filters out properties with falsy values from an object.
 *
 * This function creates a new object containing only the properties
 * from the input object that have truthy values. It removes properties
 * with falsy values such as null, undefined, empty string, 0, false, or NaN.
 *
 * @template T - The type of the input object, extending Record<string, any>
 * @param {T} obj - The input object to be filtered
 * @returns {Partial<T>} A new object with only the truthy-valued properties
 *
 * @example
 * const input = { a: 1, b: '', c: null, d: 'hello', e: 0, f: false };
 * const result = filterTruthyValues(input);
 * // result: { a: 1, d: 'hello' }
 */
const filterTruthyValues = <T extends Record<string, any>>(
  obj: T,
): Partial<T> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => Boolean(value)),
  ) as Partial<T>;
};

export default filterTruthyValues;
