import { logToSpan } from 'arvo-core';

export function getJsonSize(obj: Record<string, any>): number {
  try {
    const jsonString = JSON.stringify(obj);
    // Use TextEncoder to get actual UTF-8 byte length
    return new TextEncoder().encode(jsonString).length;
  } catch (e) {
    logToSpan({
      level: 'WARNING',
      message: `Error while calculating the size of the machine memory record. Error: ${(e as Error).message}`,
    });
    return -1;
  }
}
