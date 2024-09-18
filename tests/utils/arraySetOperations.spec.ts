import arraySetOperations from '../../src/utils/arraySetOperations'

describe('arraySetOperations', () => {
  test('should compute correct results for the example case', () => {
    const result = arraySetOperations([1, 2, 3, 3], [2, 3, 4], [3, 4, 5]);
    expect(result).toEqual({
      union: [1, 2, 3, 4, 5],
      intersection: [3],
      partialIntersection: [2, 3, 4],
      repetition: [[3], [], []]
    });
  });

  test('should handle empty arrays', () => {
    const result = arraySetOperations([], [], []);
    expect(result).toEqual({
      union: [],
      intersection: [],
      partialIntersection: [],
      repetition: [[], [], []]
    });
  });

  test('should handle arrays with no common elements', () => {
    const result = arraySetOperations([1, 2], [3, 4], [5, 6]);
    expect(result).toEqual({
      union: [1, 2, 3, 4, 5, 6],
      intersection: [],
      partialIntersection: [],
      repetition: [[], [], []]
    });
  });

  test('should handle arrays with all common elements', () => {
    const result = arraySetOperations([1, 2, 3], [1, 2, 3], [1, 2, 3]);
    expect(result).toEqual({
      union: [1, 2, 3],
      intersection: [1, 2, 3],
      partialIntersection: [1, 2, 3],
      repetition: [[], [], []]
    });
  });

  test('should handle arrays with multiple repetitions', () => {
    const result = arraySetOperations([1, 1, 2, 2, 3], [2, 2, 3, 3, 4], [3, 3, 4, 4, 5]);
    expect(result).toEqual({
      union: [1, 2, 3, 4, 5],
      intersection: [3],
      partialIntersection: [2, 3, 4],
      repetition: [[1, 2], [2, 3], [3, 4]]
    });
  });

  test('should handle arrays of different lengths', () => {
    const result = arraySetOperations([1, 2, 3], [2, 3, 4, 5], [3, 4, 5, 6, 7]);
    expect(result).toEqual({
      union: [1, 2, 3, 4, 5, 6, 7],
      intersection: [3],
      partialIntersection: [2, 3, 4, 5],
      repetition: [[], [], []]
    });
  });

  test('should handle arrays with string elements', () => {
    const result = arraySetOperations(['a', 'b', 'c'], ['b', 'c', 'd'], ['c', 'd', 'e']);
    expect(result).toEqual({
      union: ['a', 'b', 'c', 'd', 'e'],
      intersection: ['c'],
      partialIntersection: ['b', 'c', 'd'],
      repetition: [[], [], []]
    });
  });

  test('should handle a single array', () => {
    const result = arraySetOperations([1, 2, 2, 3, 3, 3]);
    expect(result).toEqual({
      union: [1, 2, 3],
      intersection: [1, 2, 3],
      partialIntersection: [],
      repetition: [[2, 3]]
    });
  });
});