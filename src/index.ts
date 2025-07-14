import { assign, emit } from 'xstate';
import ArvoMachine from './ArvoMachine';
import { setupArvoMachine } from './ArvoMachine/createMachine';
import { ArvoMachineContext, EnqueueArvoEventActionParam } from './ArvoMachine/types';
import { ArvoOrchestrator } from './ArvoOrchestrator';
import { TransactionViolation, TransactionViolationCause } from './ArvoOrchestrator/error';
import { createArvoOrchestrator } from './ArvoOrchestrator/factory';
import { IArvoOrchestrator, MachineMemoryRecord } from './ArvoOrchestrator/types';
import { MachineExecutionEngine } from './MachineExecutionEngine';
import { IMachineExectionEngine } from './MachineExecutionEngine/interface';
import { ExecuteMachineInput, ExecuteMachineOutput } from './MachineExecutionEngine/types';
import { SimpleMachineMemory } from './MachineMemory/Simple';
import { TelemetredSimpleMachineMemory } from './MachineMemory/TelemetredSimple';
import { IMachineMemory } from './MachineMemory/interface';
import { MachineRegistry } from './MachineRegistry';
import { IMachineRegistry } from './MachineRegistry/interface';
import { SimpleEventBroker } from './utils/SimpleEventBroker';
import { createSimpleEventBroker } from './utils/SimpleEventBroker/helper';
import { ArvoResumable } from './ArvoResumable';
import { createArvoResumable } from './ArvoResumable/factory';
import { ArvoResumableHandler, ArvoResumableState } from './ArvoResumable/types';

const xstate = {
  emit,
  assign,
};

export {
  ArvoMachine,
  setupArvoMachine,
  ArvoMachineContext,
  EnqueueArvoEventActionParam,
  IMachineRegistry,
  MachineRegistry,
  MachineExecutionEngine,
  IMachineExectionEngine,
  ExecuteMachineInput,
  ExecuteMachineOutput,
  IMachineMemory,
  SimpleMachineMemory,
  MachineMemoryRecord,
  IArvoOrchestrator,
  TransactionViolation,
  TransactionViolationCause,
  ArvoOrchestrator,
  createArvoOrchestrator,
  SimpleEventBroker,
  createSimpleEventBroker,
  TelemetredSimpleMachineMemory,
  xstate,
  ArvoResumable,
  createArvoResumable,
  ArvoResumableHandler,
  ArvoResumableState,
};
