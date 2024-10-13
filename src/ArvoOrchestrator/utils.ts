import { cleanString } from 'arvo-core';
import * as zlib from 'zlib';
import { z } from 'zod';

/**
 * Converts an object to a compressed base64 string.
 *
 * This function takes a Zod schema and an object, validates the object against the schema,
 * and then converts it to a compressed base64 string. This is useful for efficiently
 * storing or transmitting complex objects.
 *
 * @template TSchema - The Zod schema type.
 * @param {TSchema} schema - The Zod schema to validate the object against.
 * @param {z.infer<TSchema>} obj - The object to be converted.
 * @returns {string} A compressed base64 string representation of the object.
 * @throws {Error} If the object fails schema validation or if compression fails.
 *
 * @example
 * const mySchema = z.object({ name: z.string(), age: z.number() });
 * const myObject = { name: "John", age: 30 };
 * const base64String = objectToBase64(mySchema, myObject);
 */
export const objectToBase64 = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  obj: z.infer<TSchema>,
): string => {
  try {
    const parsedObj = schema.parse(obj);
    const jsonString = JSON.stringify(parsedObj);
    const compressed = zlib.deflateSync(Buffer.from(jsonString, 'utf-8'));
    return compressed.toString('base64');
  } catch (error) {
    throw new Error(
      cleanString(`
        Error converting object to compressed base64 string:
        Error -> ${(error as Error).message}
      `),
    );
  }
};

/**
 * Converts a compressed base64 string back to an object.
 *
 * This function takes a compressed base64 string and a Zod schema, decompresses and
 * parses the string, and then validates the resulting object against the schema.
 *
 * @template TSchema - The Zod schema type.
 * @param {TSchema} schema - The Zod schema to validate the parsed object against.
 * @param {string} str - The compressed base64 string to be converted.
 * @returns {z.infer<TSchema>} The parsed and validated object.
 * @throws {Error} If decompression, parsing, or schema validation fails.
 *
 * @example
 * const mySchema = z.object({ name: z.string(), age: z.number() });
 * const base64String = "..."; // Some compressed base64 string
 * const myObject = base64ToObject(mySchema, base64String);
 */
export const base64ToObject = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  str: string,
): z.infer<TSchema> => {
  try {
    const compressed = Buffer.from(str, 'base64');
    const jsonString = zlib.inflateSync(compressed).toString('utf-8');
    const parsed = JSON.parse(jsonString);
    return schema.parse(parsed) as z.infer<TSchema>;
  } catch (error) {
    throw new Error(
      cleanString(`
        Error converting compressed base64 string to object:
        Error -> ${(error as Error).message}
      `),
    );
  }
};
