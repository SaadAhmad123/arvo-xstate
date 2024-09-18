import {
  ActionFunction,
  GuardConditionFunction,
  StateMachineContext,
} from '../types';

// export interface ITransitionGuard<TContext extends StateMachineContext> {

//   /** The target state to transition to if the guard condition is true */
//   target: string

//   /** The condition function which returns true or false*/
//   case: GuardConditionFunction<TContext>

//   /** The actions to perform before the transition completes */
//   actions?: Array<ActionFunction<TContext>>

// }

export interface ITransition<TContext extends StateMachineContext> {
  /** The target state to transition to */
  target: string;

  /** The actions to perform before the transition completes */
  actions?: Record<string, ActionFunction<TContext>>;
}
