/**
 * Computes the union, intersection, partial intersection, and repetitions of N arrays.
 *
 * @template T The type of elements in the input arrays.
 * @param {...T[][]} arrays The input arrays.
 * @returns {Object} An object containing the following properties:
 *   - union: An array of unique elements from all input arrays.
 *   - intersection: An array of elements common to all input arrays.
 *   - partialIntersection: An array of elements present in at least two input arrays.
 *   - repetition: An array of arrays, each containing unique elements that appear more than once in the corresponding input array.
 *
 * @example
 * const result = arraySetOperations([1, 2, 3, 3], [2, 3, 4], [3, 4, 5]);
 * console.log(result);
 * // Output: {
 * //   union: [1, 2, 3, 4, 5],
 * //   intersection: [3],
 * //   partialIntersection: [2, 3, 4],
 * //   repetition: [[3], [], []]
 * // }
 */
function arraySetOperations<T>(...arrays: T[][]): {
  union: T[];
  intersection: T[];
  partialIntersection: T[];
  repetition: T[][];
} {
  // Create sets for each input array
  const sets = arrays.map((arr) => Array.from(new Set(arr)));

  // Compute union
  const union = Array.from(new Set(arrays.flat()));

  // Compute intersection
  const intersection = sets.reduce(
    (acc, set) => acc.filter((item) => set.includes(item)),
    [...sets[0]],
  );

  // Compute partial intersection
  const partialIntersection = Array.from(
    new Set(
      union.filter(
        (item) => sets.filter((set) => set.includes(item)).length >= 2,
      ),
    ),
  );

  // Compute repetitions
  const repetition = arrays.map((arr) =>
    Array.from(
      new Set(arr.filter((item, index, self) => self.indexOf(item) !== index)),
    ),
  );

  return {
    union,
    intersection,
    partialIntersection,
    repetition,
  };
}

export default arraySetOperations;
