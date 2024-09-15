import { ArvoEvent } from "arvo-core"

export type SomeValue = NonNullable<string | number | boolean>

export type ActionFunction<
  TContext extends StateMachineContext,
  TEvent extends Record<string, any> = Record<string, any>
> = (param: {
  context: TContext,
  event: TEvent
}) => void

export type EmitFunction<TContext extends StateMachineContext> = () => (ArvoEvent | ArvoEvent[])

export type StateMachineContext<
  TData extends Record<string, any> = Record<string, any>,
  TLocals extends Record<string, any> = Record<string, any>,
> = {
  data: TData
  locals: TLocals
  var$: Record<string, any>
}