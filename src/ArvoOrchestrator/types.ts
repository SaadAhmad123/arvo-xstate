import { Snapshot } from 'xstate';
import ArvoMachine from '../ArvoMachine';
import { IMachineMemory } from '../MachineMemory/interface';

export type TryFunctionOutput<TData, TError extends Error> =
  | {
      type: 'success';
      data: TData;
    }
  | {
      type: 'error';
      error: TError;
    };

export type MachineMemoryRecord = {
  subject: string;
  parentSubject: string | null;
  status: 'active' | 'done' | 'error' | 'stopped' | string;
  value: string | Record<string, any> | null;
  state: Snapshot<any>;
};

export interface IArvoOrchestrator {
  executionunits: number;
  memory: IMachineMemory<MachineMemoryRecord>;
  machines: ArvoMachine<any, any, any, any, any>[];
}
