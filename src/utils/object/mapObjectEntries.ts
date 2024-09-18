/**
 * Transforms an object by applying a custom transformation function to each key-value pair.
 *
 * @template TInput - The type of the input object's values.
 * @template TOutput - The type of the output object's values.
 *
 * @param {Record<string, TInput>} inputObject - The object to be transformed.
 * @param {TransformCallback<TInput, TOutput>} transformer - A function that defines how each key-value pair should be transformed.
 *
 * @returns {Record<string, TOutput>} A new object with transformed key-value pairs.
 *
 * @example
 * const input = { a: 1, b: 2, c: 3 };
 * const result = mapObjectEntries(input, ({ key, value }) => [key.toUpperCase(), value * 2]);
 * // Result: { A: 2, B: 4, C: 6 }
 */
const mapObjectEntries = <TInput, TOutput>(
  inputObject: Record<string, TInput>,
  transformer: TransformCallback<TInput, TOutput>,
): Record<string, TOutput> => {
  return Object.fromEntries(
    Object.entries(inputObject).map(([key, value], index) =>
      transformer({ key, value, index, self: inputObject }),
    ),
  );
};

/**
 * Callback function type for transforming object entries.
 *
 * @template TInput - The type of the input value.
 * @template TOutput - The type of the output value.
 */
export type TransformCallback<TInput, TOutput> = (params: {
  key: string;
  value: TInput;
  index: number;
  self: Record<string, TInput>;
}) => [string, TOutput];

export default mapObjectEntries;
