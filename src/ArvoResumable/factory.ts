import type { ArvoOrchestratorContract, VersionedArvoContract } from 'arvo-core';
import type { ArvoResumableHandler, ArvoResumableState } from './types';
import type { IMachineMemory } from '../MachineMemory/interface';
import { ArvoResumable } from '.';
import { areServiceContractsUnique } from '../ArvoMachine/utils';
import { v4 as uuid4 } from 'uuid';

/**
 * Factory function for creating ArvoResumable orchestrator instances
 *
 * Creates a new ArvoResumable orchestrator with type safety and sensible defaults.
 * ArvoResumable provides handler-based workflow orchestration with explicit context management,
 * contract validation, and distributed locking capabilities.
 *
 * @param param - Configuration object for the orchestrator
 * @param param.types - Optional type hints for better TypeScript inference
 * @param param.types.context - Partial type hint for the workflow context structure (not used at runtime)
 * @param param.contracts - Contract definitions for the orchestrator and its services
 * @param param.contracts.self - The orchestrator's own contract defining accepted events and emitted events
 * @param param.contracts.services - Record of service contracts this orchestrator can invoke, keyed by service name
 * @param param.memory - Generic memory interface for state persistence, locking, and retrieval operations
 * @param param.handler - Versioned orchestration logic handlers mapped by semantic version
 * @param param.executionunits - Resource allocation cost for this orchestrator's execution (default: 0)
 * @param param.requiresResourceLocking - Enable distributed locking for concurrent safety (default: auto-determined by service count)
 *
 * @returns A new ArvoResumable orchestrator instance configured with the provided parameters
 *
 * @throws {Error} Service contracts have duplicate URIs - Multiple versions of the same contract are not allowed
 * @throws {Error} Circular dependency detected - Self contract is registered as a service, creating execution loops
 *
 * @remarks
 * **Resource Locking:**
 * When `requiresResourceLocking` is not specified, it defaults to `true` when multiple
 * services are configured (indicating potential concurrent operations) and `false` for
 * single-service orchestrations.
 *
 * **Contract Validation:**
 * The factory validates that all service contracts have unique URIs and prevents
 * circular dependencies where the orchestrator's own contract is registered as a service.
 */
export const createArvoResumable = <
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
>(param: {
  types?: {
    context?: Partial<TMemory>;
  };
  contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };
  memory: IMachineMemory<Record<string, any>>;
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
    memory: param.memory as IMachineMemory<ArvoResumableState<TMemory>>,
    handler: param.handler,
    executionunits: param.executionunits ?? 0,
    requiresResourceLocking: param.requiresResourceLocking ?? Object.keys(param.contracts.services).length > 1,
  });
};
