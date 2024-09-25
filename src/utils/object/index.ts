/**
 * Represents a path and its corresponding value in an object.
 * @property {string[]} path - An array of strings representing the path to the value.
 * @property {any} value - The value found at the specified path.
 */
export type PathValue = {
  path: string[];
  value: any;
};

/**
 * Recursively retrieves all paths and their corresponding values from an object.
 *
 * @param {Record<string, any>} obj - The object from which paths are extracted.
 * @returns {PathValue[]} An array of PathValue, each containing a path and its corresponding value.
 * @throws {Error} Will throw an error if `obj` is not a string or an object.
 *
 * @example
 * const obj = { a: { b: 1 }, c: 2 };
 * const paths = getAllPaths(obj);
 * // paths = [
 * //   { path: ['a', 'b'], value: 1 },
 * //   { path: ['c'], value: 2 }
 * // ]
 */
export function getAllPaths(obj: Record<string, any>): PathValue[] {
  if (!obj || !(typeof obj === 'string' || typeof obj === 'object')) {
    throw new Error(
      `[getAllPaths] the 'obj' type must be 'string' or 'object'. The given obj is '${obj}' of type '${typeof obj}'`,
    );
  }

  let result: PathValue[] = [];
  let stack: { obj: any; path: string[] }[] = [{ obj, path: [] }];

  while (stack.length > 0) {
    let { obj: currentObj, path: currentPath } = stack.pop()!;

    if (typeof currentObj !== 'object' || currentObj === null) {
      result.push({ path: currentPath, value: currentObj });
    } else {
      for (const key in currentObj) {
        if (currentObj.hasOwnProperty(key)) {
          stack.push({ obj: currentObj[key], path: currentPath.concat(key) });
        }
      }
    }
  }

  return result;
}

/**
 * Converts a PathValue object to a string representation.
 *
 * @param {PathValue} item - The PathValue object to convert.
 * @returns {string} A string representation of the PathValue.
 *
 * @example
 * const pathValue = { path: ['a', 'b'], value: 1 };
 * const result = pathValueToString(pathValue);
 * // result = "#a.#b.1"
 */
export const pathValueToString = (item: PathValue): string => {
  if (!(item.path || []).length) {
    return item.value.toString();
  }
  const pathString = item.path.map(i => '#' + i).join('.');
  return pathString + '.' + item.value;
};