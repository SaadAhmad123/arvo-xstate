import { ActionFunction } from "../types";

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
   * @returns An object representing the XState JSON schema for this component.
   */
  toXStateJSON(): {
    actions: Record<string, ActionFunction<any>>,
    def: Record<string, any>
  };
}