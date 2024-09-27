import { AnyActorLogic, AnyEventObject, MachineContext, StateMachine, ParameterizedObject, StateValue, MetaObject, StateSchema } from "xstate";
import { z } from "zod";
import { ArvoMachineVersion } from "../ArvoMachine/types";


export interface IArvoActor<
  TInputType extends string,
  TInput extends z.ZodTypeAny,
  TCompleteType extends string,
  TComplete extends z.ZodTypeAny,
> {
  init: {
    type: TInputType,
    schema: TInput
  },
  complete: {
    type: TCompleteType,
    schema: TComplete
  }
  machines: (
    StateMachine<any, any, {}, never, any, any, never, any, string, z.infer<TInput>, z.infer<TComplete>, any, any, any> & {version: ArvoMachineVersion}
  )[],

}