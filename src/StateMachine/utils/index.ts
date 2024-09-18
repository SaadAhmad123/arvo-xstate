import { cleanString, logToSpan } from 'arvo-core';
import arraySetOperations from '../../utils/arraySetOperations';
import mapObjectEntries from '../../utils/object/mapObjectEntries';
import { ToXStateJSONParam } from './IStateMachineComponent';

const valueSelectFunction = <T extends Record<string, any>>(dicts: T[]) => {
  const seenKeys: string[] = [];

  return dicts.map((dict) =>
    mapObjectEntries(dict, ({ key, value }) => {
      if (seenKeys.includes(key)) {
        return [key, null];
      }
      seenKeys.push(key);
      return [key, value];
    }),
  );
};

/**
 * Reconciles multiple dictionaries based on a given strategy.
 *
 * @template T - The type of input dictionaries.
 * @param dicts - An array of dictionaries to reconcile.
 * @param strategy - The reconciliation strategy to use.
 * @returns An array of reconciled dictionaries.
 *
 * @description
 * This function takes an array of dictionaries and reconciles them based on the specified strategy.
 * It handles key conflicts using one of the following strategies:
 *
 * - "PRESERVE_ALL": Keeps all conflicting keys by appending a unique identifier to each.
 * - "LAST_SELECT": Selects the value for conflicting keys from the last occurrence, nullifying others.
 * - "FIRST_SELECT": Selects the value for conflicting keys from the first occurrence, nullifying others.
 *
 * @example
 * // Using PRESERVE_ALL strategy
 * const dicts = [{ a: 1, b: 2 }, { b: 3, c: 4 }];
 * const result = xstateJsonResonciliator(dicts, "PRESERVE_ALL");
 * // Result: [{ a: 1, b_1: 2 }, { b_2: 3, c: 4 }]
 *
 * @example
 * // Using LAST_SELECT strategy
 * const dicts = [{ a: 1, b: 2 }, { b: 4 }, { b: 3, c: 4 }];
 * const result = xstateJsonResonciliator(dicts, "LAST_SELECT");
 * // Result: [{ a: 1, b: null }, { b: null }, { b: 3, c: 4 }]
 *
 * @example
 * // Using FIRST_SELECT strategy
 * const dicts = [{ a: 1, b: 2 }, { b: 4 }, { b: 3, c: 4 }];
 * const result = xstateJsonResonciliator(dicts, "FIRST_SELECT");
 * // Result: [{ a: 1, b: 2 }, { b: null }, { b: null, c: 4 }]
 */
export const xstateJsonResonciliator = <T extends Record<string, any>>(
  dicts: T[],
  strategy: ToXStateJSONParam['reconciliation'],
) => {
  if (!dicts.length) {
    return [];
  }
  const setOperation = arraySetOperations(
    ...dicts.map((item) => Object.keys(item)),
  );

  if (setOperation.partialIntersection.length && strategy === 'PRESERVE_ALL') {
    logToSpan({
      level: 'INFO',
      message: cleanString(`
          [XState JSON Reconciliation][Strategy=${strategy}] - There 
          are conflicting keys (=${setOperation.intersection.join(',')})
          and they will be preserved by appending a 'uuid' string to the
          keys there by making them unique.
        `),
    });

    const keyToCount = new Map<string, number>();
    return dicts.map((dict) =>
      mapObjectEntries(dict, ({ key, value }) => {
        keyToCount.set(key, (keyToCount.get(key) || 0) + 1);
        const newKey = `${key}_${keyToCount.get(key)}`;
        return [setOperation.partialIntersection.includes(key) ? newKey : key, value];
      }),
    );
  }
  if (setOperation.partialIntersection.length && strategy === 'LAST_SELECT') {
    logToSpan({
      level: 'INFO',
      message: cleanString(`
          [XState JSON Reconciliation][Strategy=${strategy}] - There 
          are conflicting keys (=${setOperation.intersection.join(',')})
          and the keys from the last occurance will be used and all the
          other ones will be nullified.
        `),
    });
    return valueSelectFunction(dicts.reverse()).reverse();
  }

  if (setOperation.partialIntersection.length && strategy === 'FIRST_SELECT') {
    logToSpan({
      level: 'INFO',
      message: cleanString(`
          [XState JSON Reconciliation][Strategy=${strategy}] - There 
          are conflicting keys (=${setOperation.intersection.join(',')})
          and the keys from the first occurance will be used and all the
          other ones will be nullified.
        `),
    });
    return valueSelectFunction(dicts);
  }

  return dicts;
};
