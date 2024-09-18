import { ActionFunction, GuardConditionFunction } from '../types';

/**
 * Represents the options for reconciling duplicate action or guard function keys.
 */
export type ToXStateJSONParam = {
  /**
   * The reconciliation strategy to use for handling duplicate keys.
   * @description
   * - "LAST_SELECT": Selects the last occurrence of duplicating function or guard keys.
   * - "FIRST_SELECT": Selects the first occurrence of duplicating function or guard keys.
   * - "PRESERVE_ALL": Keeps all duplicating keys by appending a unique identifier to each.
   */
  reconciliation: "LAST_SELECT" | "FIRST_SELECT" | "PRESERVE_ALL";
};

/**
 * Represents the base interface for state machine components.
 * 
 * This interface defines the common functionality required by all
 * primitive types in the state machine, such as State and Transition.
 */
export interface IStateMachineComponent {
  /**
   * Converts the state machine component to an XState-compatible JSON schema.
   * 
   * @param param - The parameters for JSON conversion, including the reconciliation strategy.
   * @returns An object containing the component's XState-compatible representation.
   * @property actions - A record of action functions indexed by their names.
   * @property guards - A record of guard functions indexed by their names.
   * @property def - A record containing the component's definition in XState format.
   */
  toXStateJSON(param: ToXStateJSONParam): {
    actions: Record<string, ActionFunction<any>>;
    guards: Record<string, GuardConditionFunction<any>>
    def: Record<string, any>;
  };
}