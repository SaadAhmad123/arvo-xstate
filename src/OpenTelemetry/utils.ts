import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents the structure of a package.json file.
 *
 * This interface defines the minimum required fields (name and version)
 * and allows for additional fields using an index signature.
 *
 * @example
 * const packageJson: PackageJson = {
 *   name: "my-package",
 *   version: "1.0.0",
 *   description: "An example package",
 *   author: "John Doe"
 * };
 */
interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

/**
 * Retrieves the name and version from the package.json file.
 *
 * This function attempts to read and parse the package.json file located two
 * directories above the current file. It's useful for dynamically obtaining
 * the package information at runtime.
 *
 * @returns An object containing the name and version of the package.
 * @throws Will not throw, but logs an error if the file cannot be read or parsed.
 *
 * @example
 * const { name, version } = getPackageInfo();
 * console.log(`Package: ${name}, Version: ${version}`);
 */
export function getPackageInfo(defaultName: string): {
  name: string;
  version: string;
} {
  try {
    // Read the package.json file
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    // Parse the JSON content
    const packageJson: PackageJson = JSON.parse(packageJsonContent);
    // Extract name and version
    const { name, version } = packageJson;
    return { name, version };
  } catch (error) {
    console.error('Error reading package.json:', error);
    return { name: defaultName, version: 'Unknown' };
  }
}