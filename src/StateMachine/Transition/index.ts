import { IStateMachineComponent } from '../utils/IStateMachineComponent';
import { ActionFunction, StateMachineContext } from '../types';
import { ITransition } from './types';
import mapObjectEntries from '../../utils/object/mapObjectEntries';

export default class Transition<TContext extends StateMachineContext>
  implements IStateMachineComponent
{
  readonly target: string;
  readonly actions: Record<string, ActionFunction<TContext>>;

  constructor(param: ITransition<TContext>) {
    this.target = param.target;
    this.actions = param.actions ?? {};
  }

  toXStateJSON() {
    const transitionActionMap = mapObjectEntries(
      this.actions,
      ({ key, value }) => [`trans.${key}`, value],
    );

    return {
      guards: {},
      actions: {},
      def: {},
    };
  }
}
