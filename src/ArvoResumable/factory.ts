import type { ArvoOrchestratorContract, VersionedArvoContract } from 'arvo-core';
import type { ArvoResumableHandler, ArvoResumableState } from './types.js';
import type { IMachineMemory } from '../MachineMemory/interface.js';
import { ArvoResumable } from '.';
import { areServiceContractsUnique } from '../ArvoMachine/utils.js';
import { v4 as uuid4 } from 'uuid';

/**
 * Factory function for creating ArvoResumable orchestrator instances
 *
 * This function provides a convenient way to create new ArvoResumable orchestrators
 * with type safety and sensible defaults. It handles the instantiation and configuration
 * of the orchestrator with the provided contracts, memory interface, and handler logic.
 *
 * @template TMemory - The type of the workflow's memory/state object
 *
 * @param param - Configuration object for the orchestrator
 * @param param.contracts - Contract definitions for the orchestrator and its services
 * @param param.contracts.self - The orchestrator's own contract defining its interface
 * @param param.contracts.services - Record of service contracts this orchestrator can call
 * @param param.memory - Memory interface for state persistence and retrieval
 * @param param.handler - The versioned orchestration logic handler function
 * @param param.executionunits - Resource allocation for this orchestrator (default: 0)
 * @param param.requiresResourceLocking - Whether to enable distributed locking (default: true when multiple services, false when single service)
 *
 * @returns A new ArvoResumable orchestrator instance configured with the provided parameters
 *
 * @throws {Error}
 *  - When service contracts have duplicate URIs
 *  - When the self contract is registered as a service (circular dependency)
 */
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
  const __areServiceContractsUnique = areServiceContractsUnique(param.contracts.services);
  if (!__areServiceContractsUnique.result) {
    throw new Error(
      `The service contracts must have unique URIs. Multiple versions of the same contract are not allow. The contracts '${__areServiceContractsUnique.keys[0]}' and '${__areServiceContractsUnique.keys[1]}' have the same URI '${__areServiceContractsUnique.contractUri}'`,
    );
  }

  const __checkIfSelfIsAService = areServiceContractsUnique({
    ...param.contracts.services,
    [uuid4()]: param.contracts.self,
  });
  if (!__checkIfSelfIsAService.result) {
    throw new Error(
      `Circular dependency detected: Machine with URI '${param.contracts.self.uri}' is registered as service '${__checkIfSelfIsAService.keys[1]}'. Self-referential services create execution loops and are prohibited.`,
    );
  }

  return new ArvoResumable<TMemory, TSelfContract, TServiceContract>({
    contracts: param.contracts,
    memory: param.memory,
    handler: param.handler,
    executionunits: param.executionunits ?? 0,
    requiresResourceLocking: param.requiresResourceLocking ?? Object.keys(param.contracts.services).length > 1,
  });
};
