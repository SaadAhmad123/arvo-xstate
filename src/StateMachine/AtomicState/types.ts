import Transition from '../Transition';
import { ActionFunction, SomeValue, StateMachineContext } from '../types';

/**
 * Represents an atomic state in a state machine.
 * An atomic state is a basic state that cannot be further decomposed into sub-states.
 */
export interface IAtomicState<TContext extends StateMachineContext> {
  /**
   * Indicates whether this state is a final state.
   * @default false
   */
  final?: boolean;

  /**
   * A record of entry actions to be executed when entering this state.
   * The keys are action names, and the values are action functions.
   */
  entry?: Record<string, ActionFunction<TContext>>;

  /**
   * A record of exit actions to be executed when exiting this state.
   * The keys are action names, and the values are action functions.
   */
  exit?: Record<string, ActionFunction<TContext>>;

  /**
   * Represents transitions that are always active and evaluated,
   * regardless of the event that occurred.
   * Can be a single Transition or an array of Transitions.
   *
   * @remarks
   * An AtomicState can have either the `always` field or the `on` field,
   * but not both simultaneously.
   */
  always?: Transition<TContext>;

  /**
   * A record of event-triggered transitions.
   * The keys are event types, and the values are either a single Transition
   * or an array of Transitions that can be taken when the event occurs.
   *
   * @remarks
   * An AtomicState can have either the `on` field or the `always` field,
   * but not both simultaneously.
   */
  on?: Record<string, Transition<TContext>>;

  /**
   * An array of tags associated with this state.
   * Tags can be used to group states or add metadata for querying purposes.
   */
  tags?: Array<string>;

  /**
   * Additional metadata associated with this state.
   * Can be used to store any custom information relevant to the state.
   */
  meta?: Record<string, SomeValue | null>;

  /**
   * A human-readable description of the state.
   * Useful for documentation and debugging purposes.
   */
  description?: string;
}
