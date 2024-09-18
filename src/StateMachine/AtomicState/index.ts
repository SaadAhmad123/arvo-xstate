import { cleanString, logToSpan } from 'arvo-core';
import filterTruthyValues from '../../utils/object/filterTruthyValues';
import mapObjectEntries from '../../utils/object/mapObjectEntries';
import {
  IStateMachineComponent,
  ToXStateJSONParam,
} from '../utils/IStateMachineComponent';
import Transition from '../Transition';
import { ActionFunction, SomeValue, StateMachineContext } from '../types';
import { IAtomicState } from './types';
import { xstateJsonResonciliator } from '../utils';

/**
 * Represents an atomic state in a state machine.
 * An atomic state is a basic state that cannot be further decomposed into sub-states.
 *
 * @template TContext - The type of the state machine context.
 * @implements {IStateMachineComponent}
 *
 * @remarks
 * AtomicState is the fundamental building block of a state machine. It can have entry and exit actions,
 * transitions triggered by events or automatic transitions, and metadata associated with it.
 *
 * @example
 * ```typescript
 * const lightBulbState = createAtomicState<LightBulbContext>({
 *   description: "Light Bulb On",
 *   entry: {
 *     turnOnLight: ({context}) => { ... }
 *   },
 *   exit: {
 *     turnOffLight: ({context}) => { ... }
 *   },
 *   on: {
 *     TOGGLE: createTransition(...)
 *   },
 *   meta: { brightness: 100 },
 *   tags: ["active", "consuming-power"]
 * });
 * ```
 */
export class AtomicState<TContext extends StateMachineContext>
  implements IStateMachineComponent
{
  /**
   * Indicates whether this state is a final state.
   */
  readonly final: boolean = false;

  /**
   * A record of entry actions to be executed when entering this state.
   */
  readonly entry: Record<string, ActionFunction<TContext>> = {};

  /**
   * A record of exit actions to be executed when exiting this state.
   */
  readonly exit: Record<string, ActionFunction<TContext>> = {};

  /**
   * Represents transitions that are always active and evaluated,
   * regardless of the event that occurred.
   */
  readonly always: Transition<TContext> | null = null;

  /**
   * A record of event-triggered transitions.
   */
  readonly on: Record<string, Transition<TContext>> | null = null;

  /**
   * Additional metadata associated with this state.
   */
  readonly meta: Record<string, SomeValue | null> = {};

  /**
   * A human-readable description of the state.
   * @default "AtomicState"
   */
  readonly description: string = 'AtomicState';

  /**
   * An array of tags associated with this state.
   */
  readonly tags: Array<string> = [];

  /**
   * Creates a new instance of AtomicState.
   *
   * @param param - The configuration object for the AtomicState.
   *
   * @throws {Error} If both 'always' and 'on' transitions are defined.
   * @throws {Error} If the state is non-final and has neither 'always' nor 'on' transitions defined.
   */
  constructor(param: IAtomicState<TContext>) {
    this.final = Boolean(param.final);
    this.entry = param.entry ?? this.entry;
    this.exit = param.exit ?? this.exit;
    this.meta = param.meta ?? this.meta;
    this.description = param.description ?? this.description;
    this.always = param.always ?? this.always;
    this.on = param.on ?? this.on;
    this.tags = param.tags ?? this.tags;

    // Both `always` and `on` are defined
    if (this.always !== null && this.on !== null) {
      throw Error(
        cleanString(`
        A state must not have both 'always' and 'on'
        transitions defined.
      `),
      );
    }

    // The `final` is **false**, and `always` and `on` are not defined
    if (this.final === false && this.always === null && this.on === null) {
      throw Error(
        cleanString(`
        A non-final state must have either "on" 
        or "always" transitions defined. None were provided.
        State description is "${this.description}"
      `),
      );
    }
  }

  /**
   * Converts the AtomicState to a format compatible with XState.
   *
   * @param param - Configuration options for JSON conversion.
   * @param [param.reconciliation='FIRST_SELECT'] - The strategy for handling duplicate action keys.
   * @returns An object containing actions and the state definition in XState format.
   *
   * @remarks
   * This method transforms the AtomicState into a structure that can be directly used with XState.
   * It handles the conversion of entry and exit actions, state type, transitions, metadata, and tags.
   *
   * The reconciliation strategy determines how to handle duplicate action keys:
   * - 'FIRST_SELECT': Uses the first occurrence of duplicate keys.
   * - 'LAST_SELECT': Uses the last occurrence of duplicate keys.
   * - 'PRESERVE_ALL': Keeps all duplicate keys by appending unique identifiers.
   *
   * @throws {Error} If the reconciliation strategy is invalid or not supported.
   */
  toXStateJSON(
    param: ToXStateJSONParam = {
      reconciliation: 'FIRST_SELECT',
    },
  ) {
    const [entryActions, exitActions] = xstateJsonResonciliator(
      [this.entry, this.exit],
      param.reconciliation,
    );

    return {
      guards: {},
      actions: {
        ...filterTruthyValues(entryActions),
        ...filterTruthyValues(exitActions),
      },
      def: {
        entry: Object.keys(entryActions),
        exit: Object.keys(exitActions),
        meta: this.meta,
        description: this.description,
        tags: this.tags,
        ...filterTruthyValues({
          type: this.final ? 'final' : null,
          always: this.always,
          on: this.on,
        }),
      },
    };
  }
}
