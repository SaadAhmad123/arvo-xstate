import { IMachineMemory, MachineMemoryRecord } from '../../../src';

export type OrchestratorConfig = {
  memory: IMachineMemory<MachineMemoryRecord>;
};