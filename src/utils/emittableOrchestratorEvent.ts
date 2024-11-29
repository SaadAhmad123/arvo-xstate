import {
  ArvoSemanticVersion,
  VersionedArvoContract,
  ArvoOrchestratorContract,
  ArvoOrchestrationSubject,
} from 'arvo-core';
import { z } from 'zod';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';

/**
 * Creates an emittable event for an orchestrator with proper subject chain and type validation.
 * This function is designed to be utilited in the state machine `emit` and `enqueueArvoEvent`
 * functions
 *
 * @template TContract - Type of the versioned orchestrator contract
 *
 * @param contract - The versioned contract that defines the event schema and type
 * @param param - Event parameters excluding type and subject, which are derived from the contract
 *
 * @returns An event action parameter with validated type, subject chain, and dataschema
 *
 * @throws {Error} If data.parentSubject$$ is missing or invalid
 *
 * @example
 * ```typescript
 * const event = emittableOrchestratorEvent(orchestratorContract.version('0.0.1'), {
 *   data: {
 *     parentSubject$$: "parent-subject-id",
 *     // other data fields...
 *   },
 * });
 * ```
 *
 *
 */
export const emittableOrchestratorEvent = <
  TContract extends VersionedArvoContract<
    ArvoOrchestratorContract,
    ArvoSemanticVersion
  >,
>(
  contract: TContract,
  param: Omit<
    EnqueueArvoEventActionParam<
      z.input<TContract['accepts']['schema']>,
      TContract['accepts']['type'],
      Record<string, any>
    >,
    'type' | 'subject'
  >,
): EnqueueArvoEventActionParam<
  z.input<TContract['accepts']['schema']>,
  TContract['accepts']['type'],
  Record<string, any>
> => {
  const parentSubject: string = param.data.parentSubject$$;
  if (!parentSubject) {
    throw new Error(
      `For an orchestrator event to be emitted, the data.parentSubject$$ must be provided.`,
    );
  }
  const newSubject = ArvoOrchestrationSubject.from({
    subject: parentSubject,
    orchestator: contract.accepts.type,
    version: contract.version,
  });
  return {
    ...param,
    subject: newSubject,
    type: contract.accepts.type,
    dataschema: `${contract.uri}/${contract.version}`,
  };
};
