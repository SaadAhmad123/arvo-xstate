import { z } from 'zod';
import { IArvoOrchestrator } from './types';
import { ArvoContract } from 'arvo-core';
import { AnyActorLogic } from 'xstate';
import ArvoOrchestrator from '.';

/**
 * Creates and returns a new ArvoOrchestrator instance.
 *
 * This factory function simplifies the process of creating an ArvoOrchestrator by handling
 * the complex generic type parameters and instantiation.
 *
 * @template TUri - The URI type for the orchestrator. This should be a string type that
 *                  uniquely identifies the orchestrator.
 *
 * @template TInitType - The initialization type for the orchestrator. This string type
 *                       defines the event type used to initialize the orchestrator.
 *
 * @template TInit - The Zod schema for the initialization data. This schema defines the
 *                   structure and validation rules for the data passed during orchestrator
 *                   initialization.
 *
 * @template TCompleteType - The completion type for the orchestrator. This string type
 *                           defines the event type emitted when the orchestration completes.
 *
 * @template TComplete - The Zod schema for the completion data. This schema defines the
 *                       structure and validation rules for the data emitted when the
 *                       orchestration completes.
 *
 * @template TServiceContracts - A record type mapping service names to their respective
 *                               ArvoContracts. This defines the contracts for all services
 *                               that the orchestrator can interact with.
 *
 * @template TLogic - The type of actor logic used in the orchestrator. This should extend
 *                    AnyActorLogic from XState and defines the state machine logic for
 *                    the orchestrator.
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
export const createArvoOrchestator = <
  TUri extends string,
  TInitType extends string,
  TInit extends z.ZodTypeAny,
  TCompleteType extends string,
  TComplete extends z.ZodTypeAny,
  TServiceContracts extends Record<string, ArvoContract>,
  TLogic extends AnyActorLogic,
>(
  param: IArvoOrchestrator<
    TUri,
    TInitType,
    TInit,
    TCompleteType,
    TComplete,
    TServiceContracts,
    TLogic
  >,
) => {
  return new ArvoOrchestrator<
    TUri,
    TInitType,
    TInit,
    TCompleteType,
    TComplete,
    TServiceContracts,
    TLogic
  >(param);
};
