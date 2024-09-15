import { IStateMachineComponent } from "../utils/IStateMachineComponent";
import { StateMachineContext } from "../types";

export default class Transition<TContext extends StateMachineContext> implements IStateMachineComponent{
  toXStateJSON(): Record<string, unknown> {
    return {}
  }
}