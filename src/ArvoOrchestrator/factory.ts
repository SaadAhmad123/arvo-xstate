import { IArvoOrchestrator } from './types';
import { ArvoOrchestratorContract } from 'arvo-core';
import { AnyActorLogic } from 'xstate';
import ArvoOrchestrator from '.';

/**
 * Creates and returns a new ArvoOrchestrator instance.
 *
 * This factory function simplifies the process of creating an ArvoOrchestrator by handling
 * the complex generic type parameters and instantiation.
 *
 * @template TSelfContract - The self contract
 *
 * @param param - Configuration parameters for the ArvoOrchestrator. This object should
 *                conform to the IArvoOrchestrator interface, which includes all necessary
 *                configuration options such as machines, execution units, etc.
 *
 * @returns A new instance of ArvoOrchestrator, fully typed and configured according to
 *          the provided generic parameters and configuration object.
 *
 * @throws Will throw an error if the provided parameters do not meet the requirements
 *         specified in the ArvoOrchestrator constructor.
 *
 * @see ArvoOrchestrator for more details on the orchestrator's functionality and usage.
 */
export const createArvoOrchestrator = <
  TSelfContract extends ArvoOrchestratorContract,
>(
  param: IArvoOrchestrator<TSelfContract>,
) => {
  return new ArvoOrchestrator<TSelfContract>(param);
};
