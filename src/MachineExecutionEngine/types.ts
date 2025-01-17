import type { ArvoEvent } from 'arvo-core';
import type { Snapshot } from 'xstate';
import type ArvoMachine from '../ArvoMachine';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';

export type ExecuteMachineInput = {
  machine: ArvoMachine<any, any, any, any, any>;
  state: Snapshot<any> | null;
  event: ArvoEvent;
};

export type ExecuteMachineOutput = {
  state: Snapshot<any>;
  events: EnqueueArvoEventActionParam[];
  finalOutput: any;
};
