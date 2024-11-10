import { cleanString } from 'arvo-core';
import * as zlib from 'node:zlib';
import { z } from 'zod';
import { Version } from '../types';

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

/**
 * Compares two semantic versions and determines if the first version is greater than the second.
 *
 * @param version1 - First semantic version to compare
 * @param version2 - Second semantic version to compare
 * @returns True if version1 is greater than version2, false otherwise
 *
 * @example
 * isVersionGreater('2.0.0', '1.9.9') // returns true
 * isVersionGreater('1.2.3', '1.2.4') // returns false
 */
function isVersionGreater(version1: Version, version2: Version): boolean {
  const [major1, minor1, patch1] = version1.split('.').map(Number);
  const [major2, minor2, patch2] = version2.split('.').map(Number);

  if (major1 !== major2) return major1 > major2;
  if (minor1 !== minor2) return minor1 > minor2;
  return patch1 > patch2;
}

/**
 * Finds the latest (highest) semantic version from a list of versions.
 * Versions must follow the format 'major.minor.patch' where each component is a number.
 *
 * @param versions - Array of semantic versions to compare
 * @returns The latest semantic version from the list
 * @throws Error if the versions array is empty
 *
 * @example
 * ```typescript
 * const versions = ['1.0.0', '2.0.0', '1.9.9', '2.1.0'];
 * const latest = findLatestVersion(versions);
 * console.log(latest); // '2.1.0'
 *
 * // With type safety
 * const typedVersions: `${number}.${number}.${number}`[] = ['1.0.0', '2.0.0'];
 * const latestTyped = findLatestVersion(typedVersions);
 * ```
 */
export function findLatestVersion(versions: Version[]): Version {
  if (versions.length === 0) {
    throw new Error('Cannot find latest version from empty array');
  }

  return versions.reduce((latest, current) => {
    return isVersionGreater(current, latest) ? current : latest;
  }, versions[0]);
}

/**
 * Type guard to check if a string is a valid semantic version in the format 'number.number.number'.
 *
 * @param version - String to check if it's a valid semantic version
 * @returns True if the string is a valid semantic version, false otherwise
 *
 * @example
 * ```typescript
 * const version = '1.0.0';
 * if (isSemanticVersion(version)) {
 *   // version is now typed as `${number}.${number}.${number}`
 *   const latest = findLatestVersion([version]);
 * }
 * ```
 */
export function isSemanticVersion(version: Version): version is Version {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;

  const [major, minor, patch] = version.split('.').map(Number);
  return (
    Number.isInteger(major) &&
    Number.isInteger(minor) &&
    Number.isInteger(patch) &&
    major >= 0 &&
    minor >= 0 &&
    patch >= 0
  );
}
