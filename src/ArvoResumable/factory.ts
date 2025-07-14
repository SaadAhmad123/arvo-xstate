import type { ArvoOrchestratorContract, VersionedArvoContract } from 'arvo-core';
import type { ArvoResumableHandler, ArvoResumableState } from './types.js';
import type { IMachineMemory } from '../MachineMemory/interface.js';
import { ArvoResumable } from '.';

export const createArvoResumable = <
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
>(param: {
  contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };
  memory: IMachineMemory<ArvoResumableState<TMemory>>;
  handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
  executionunits?: number;
  requiresResourceLocking?: boolean;
}) => {
  return new ArvoResumable<TMemory, TSelfContract, TServiceContract>({
    contracts: param.contracts,
    memory: param.memory,
    handler: param.handler,
    executionunits: param.executionunits ?? 0,
    requiresResourceLocking: param.requiresResourceLocking ?? true,
  });
};
