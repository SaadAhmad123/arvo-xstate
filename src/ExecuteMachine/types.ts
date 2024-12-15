import { Snapshot } from 'xstate';
import ArvoMachine from '../ArvoMachine';
import { ArvoEvent } from 'arvo-core';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';

export type ExecuteMachineInput = {
  machine: ArvoMachine<any, any, any, any, any>;
  state: Snapshot<any> | null;
  event: ArvoEvent;
};

export type ExecuteMachineOutput = {
  state: Snapshot<any>;
  events: EnqueueArvoEventActionParam[];
  finalOutput: any | null;
};
