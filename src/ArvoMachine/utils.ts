import type { ArvoContract, VersionedArvoContract } from 'arvo-core';
import type { MachineConfig } from 'xstate';

/**
 * Detects if an XState machine configuration contains any parallel states.
 * Uses a stack-based approach for efficient traversal of the state hierarchy.
 *
 * @param config - XState machine configuration
 * @returns True if the machine contains at least one parallel state, false otherwise
 *
 * @example
 * const machine = {
 *   states: {
 *     processing: {
 *       type: 'parallel',
 *       states: {
 *         upload: { ... },
 *         scan: { ... }
 *       }
 *     }
 *   }
 * }
 * const hasParallel = detectParallelStates(machine) // Returns true
 */
export const detectParallelStates = (config?: MachineConfig<any, any, any, any, any, any, any, any, any, any, any>) => {
  if (!config?.states) {
    return false;
  }
  const stack: Array<typeof config> = [config];
  while (stack.length) {
    const currentConfig = stack.pop();
    if (!currentConfig?.states) continue;
    if (currentConfig.type === 'parallel') return true;
    for (const state of Object.values(currentConfig.states)) {
      stack.push(state);
    }
  }
  return false;
};

/**
 * Validates that all service contracts in a collection have unique URIs.
 *
 * Iterates through the provided contracts and checks if any URI appears more than once.
 * Multiple versions of the same contract (with the same URI) are not allowed.
 *
 * @param contracts - A record mapping contract keys to their respective ArvoContract objects
 * @returns An object with a boolean result indicating if all contracts are unique, and the error keys if not
 */
export const areServiceContractsUnique = (
  contracts: Record<string, ArvoContract | VersionedArvoContract<any, any>>,
):
  | {
      result: false;
      keys: [string, string];
      contractUri: string;
    }
  | {
      result: true;
    } => {
  const uriToKeyMap: Record<string, string> = {};
  for (const [key, contract] of Object.entries(contracts)) {
    if (uriToKeyMap[contract.uri]) {
      return {
        result: false,
        keys: [key, uriToKeyMap[contract.uri]],
        contractUri: contract.uri,
      };
    }
    uriToKeyMap[contract.uri] = key;
  }
  return {
    result: true,
  };
};
