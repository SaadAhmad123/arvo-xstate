import { ArvoContract, ArvoEvent } from "arvo-core"

type Transition = {}

type ActionFunction = () => void
type EmitFunction = () => (ArvoEvent | ArvoEvent[])
type StateMap = Record<string, AtomicState | CompoundState | ParallelState | ArvoEventState>

type AtomicState = {
  final?: boolean
  entry?: Record<string, ActionFunction>,
  exit?: Record<string, ActionFunction>,
  always?: Transition | Array<Transition>,
  on: Record<string, Transition | Array<Transition>>
}

type ArvoEventState = {
  contract: ArvoContract
  emit?: EmitFunction | Array<EmitFunction>
} & AtomicState

type CompoundState = {
  onDone?: string,
  initial: string
  states: StateMap
} & Pick<AtomicState, 'exit' | 'entry' | 'final'>

type ParallelState = {
  onDone?: string
  states: StateMap
} & Pick<AtomicState, 'exit' | 'entry' | 'final'>

type FSMContext<
  TData extends Record<string, any> = Record<string, any>,
  TLocals extends Record<string, any> = Record<string, any>,
> = {
  data: TData
  locals: TLocals
  var$: Record<string, any>
}

type FSM<TContext extends FSMContext> = {
  id: string
  context: (input: any) => TContext
  initial: string
  states: StateMap
}