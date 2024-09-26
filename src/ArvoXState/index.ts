import XStateMachineBuilder from '../XStateMachineBuilder';

/**
 * ArvoXState is a utility class that provides a singleton instance of 
 * XStateMachineBuilder for use within the Arvo ecosystem.
 *
 * @remarks
 * This class encapsulates the XStateMachineBuilder, making it easily accessible throughout the Arvo application.
 * It ensures that only one instance of XStateMachineBuilder is created and used, following the singleton pattern.
 *
 * @example
 * ```typescript
 * import ArvoXState from './ArvoXState';
 *
 * const { createMachine } = ArvoXState.machine.setup({
 *   // ... setup configuration
 * });
 *
 * const myMachine = createMachine({
 *   // ... machine configuration
 * });
 * ```
 */
export default class ArvoXState {
  public static machine = new XStateMachineBuilder();
}
