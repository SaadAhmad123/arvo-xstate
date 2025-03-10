import {
  type ArvoOrchestratorEventTypeGen,
  type InferVersionedArvoContract,
  type VersionedArvoContract,
  cleanString,
} from 'arvo-core';
import {
  type ActionFunction,
  type MachineConfig,
  type MachineContext,
  type MetaObject,
  type ParameterizedObject,
  type SetupTypes,
  assign,
  setup as xstateSetup,
} from 'xstate';
import type { z } from 'zod';
import ArvoMachine from '.';
import { getAllPaths } from '../utils/object';
import type {
  ArvoMachineContext,
  EnqueueArvoEventActionParam,
  ExtractOrchestratorType,
  InferServiceContract,
  ToParameterizedObject,
  ToProvidedActor,
} from './types';
import { areServiceContractsUnique, detectParallelStates } from './utils';
import { v4 as uuid4 } from 'uuid';

/**
 * Establishes the foundation for creating Arvo-compatible state machines.
 *
 * This function configures the core elements of an Arvo state machine, including
 * built-in actions like `enqueueArvoEvent`, and enforces Arvo-specific constraints
 * to ensure compatibility with the Arvo event-driven system.
 *
 * @param param - Configuration object for the machine setup
 * @returns An object containing the `createMachine` function
 * @throws {Error} If 'actors', 'delays', or reserved action names are used in the configuration
 *
 * @description
 * `setupArvoMachine` is a crucial function in the Arvo ecosystem, designed to create
 * synchronous state machine orchestrations for Arvo's event-driven architecture.
 * It builds upon XState, providing a tailored implementation that:
 *
 * 1. Enforces synchronous behavior to maintain predictable state transitions
 * 3. Implements Arvo-specific constraints and features
 *
 * Key features:
 * - Synchronous execution: Ensures deterministic behavior in event-driven systems
 * - Built-in actions: Includes `enqueueArvoEvent` for Arvo event handling
 * - Constraint checking: Prevents usage of asynchronous features like 'actors' or 'delays'
 *
 * @remarks
 * While `setupArvoMachine` is based on XState's `setup` and `createMachine` functions,
 * it includes Arvo-specific modifications and restrictions. For a deeper understanding
 * of the underlying XState concepts, refer to the official XState documentation:
 * - XState setup: https://stately.ai/docs/setup
 * - XState createMachine: https://stately.ai/docs/machines
 *
 * @example
 * Here's a comprehensive example demonstrating how to use `setupArvoMachine`:
 *
 * ```typescript
 * import { setupArvoMachine } from 'arvo-xstate'
 * import { createArvoOrchestratorContract, ArvoErrorSchema, createArvoContract } from 'arvo-core'
 * import { z } from 'zod'
 *
 * // Define the LLM orchestrator contract
 * const llmContract = createArvoOrchestratorContract({
 *   uri: `#/orchestrators/llm/`,
 *   type: 'llm',
 *   versions: {
 *     '0.0.1': {
 *       init: z.object({
 *         request: z.string(),
 *         llm: z.enum(['gpt-4', 'gpt-4o']),
 *       }),
 *       complete: z.object({
 *         response: z.string(),
 *       })
 *     }
 *   }
 * })
 *
 * // Define the OpenAI service contract
 * const openAiContract = createArvoContract({
 *   uri: `#/services/openai`,
 *   type: 'com.openai.completions',
 *   versions: {
 *     '0.0.1': {
 *       accepts: z.object({
 *         request: z.string()
 *       }),
 *       emits: {
 *         'evt.openai.completions.success': z.object({
 *           response: z.string(),
 *         })
 *       }
 *     }
 *   }
 * })
 *
 * const machineId = 'machineV100'
 *
 * // Set up the Arvo machine
 * const llmMachine = setupArvoMachine({
 *   contracts: {
 *     self: llmContract.version('0.0.1'),
 *     services: {
 *       openAiContract.version('0.0.1'),
 *     }
 *   },
 *   types: {
 *     context: {} as {
 *       request: string,
 *       llm: string,
 *       response: string | null,
 *       errors: z.infer<typeof ArvoErrorSchema>[]
 *     },
 *     tags: {} as 'pending' | 'success' | 'error',
 *   },
 *   actions: {
 *     log: ({context, event}) => console.log({context, event})
 *   },
 *   guards: {
 *     isValid: ({context, event}) => Boolean(context.request)
 *   }
 * }).createMachine({
 *   id: machineId,
 *   context: ({input}) => ({
 *     request: input.request,
 *     llm: input.llm,
 *     response: null,
 *     errors: [],
 *   }),
 *   initial: 'validate',
 *   states: {
 *     validate: {
 *       always: [
 *         {
 *           guard: 'isValid',
 *           target: 'llm',
 *         },
 *         {
 *           target: 'error',
 *         }
 *       ]
 *     },
 *     llm: {
 *       entry: [
 *         {
 *           type: 'log',
 *         },
 *         emit(({context}) => ({
 *           type: 'com.openai.completions',
 *           data: {
 *             request: context.request,
 *           },
 *         }))
 *       ],
 *       on: {
 *         'evt.openai.completions.success': {
 *           actions: [
 *             assign({response: ({event}) => event.response})
 *           ],
 *           target: 'done'
 *         },
 *         'sys.com.openai.completions.error': {
 *           actions: [
 *             assign({errors: ({context, event}) => [...context.errors, event.body]})
 *           ],
 *           target: 'error'
 *         }
 *       }
 *     },
 *     done: {
 *       type: 'final'
 *     },
 *     error: {
 *       type: 'final'
 *     },
 *   }
 * });
 * ```
 *
 * This example demonstrates:
 * 1. Defining Arvo contracts for the orchestrator and a service
 * 2. Setting up an Arvo machine with contracts, types, actions, and guards
 * 3. Creating a machine with states for validation, LLM interaction, and error handling
 * 4. Using XState features like `emit` bound with Arvo contracts for event emitting and event handling via transitions
 */
export function setupArvoMachine<
  TContext extends MachineContext,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContracts extends Record<string, VersionedArvoContract<any, any>>,
  // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped.
  TActions extends Record<string, ParameterizedObject['params'] | undefined> = {},
  // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
  TGuards extends Record<string, ParameterizedObject['params'] | undefined> = {},
  TTag extends string = string,
  TMeta extends MetaObject = MetaObject,
>(param: {
  schemas?: unknown;
  contracts: {
    // The self orchestrator contract defining the machine init input
    // data structure and completion output data structure
    self: TSelfContract;
    // Definition of all the services the orchestrator talks to and
    // send and/or recieves events from
    services: TServiceContracts;
  };
  types?: Omit<
    SetupTypes<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
      {},
      TTag,
      InferVersionedArvoContract<TSelfContract>['accepts']['data'],
      InferVersionedArvoContract<TSelfContract>['emits'][ReturnType<
        typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
      >]['data'],
      InferServiceContract<TServiceContracts>['emitted'],
      TMeta
    >,
    'input' | 'output' | 'children' | 'emitted'
  >;
  actions?: {
    [K in keyof TActions]: ActionFunction<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      InferServiceContract<TServiceContracts>['events'],
      TActions[K],
      never,
      ToParameterizedObject<TActions>,
      ToParameterizedObject<TGuards>,
      never,
      InferServiceContract<TServiceContracts>['emitted']
    >;
  };
  guards?: {
    [K in keyof TGuards]: (
      args: {
        context: TContext;
        event: InferServiceContract<TServiceContracts>['events'];
      },
      params: TGuards[K],
    ) => boolean;
  };
}) {
  const createConfigErrorMessage = (type: 'actor' | 'delays') => {
    return cleanString(`
      Configuration Error: '${type}' not supported in Arvo machines
      
      Arvo machines do not support XState ${type === 'actor' ? 'actors' : 'delay transitions'} as they introduce asynchronous behavior.
      
      To fix:
      1. Remove the '${type}' configuration
      2. Use Arvo's event-driven patterns instead for asynchronous operations
    `);
  };

  if ((param as any).actors) {
    throw new Error(createConfigErrorMessage('actor'));
  }

  if ((param as any).delays) {
    throw new Error(createConfigErrorMessage('delays'));
  }

  if (param.actions?.enqueueArvoEvent) {
    throw new Error(
      cleanString(`
        Configuration Error: Reserved action name 'enqueueArvoEvent'
        
        'enqueueArvoEvent' is an internal Arvo system action and cannot be overridden.
        
        To fix: Use a different name for your action, such as:
        - 'queueCustomEvent'
        - 'scheduleEvent'
        - 'dispatchEvent'
      `),
    );
  }

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

  const combinedActions = {
    ...((param.actions ?? {}) as typeof param.actions),
    enqueueArvoEvent: assign<
      TContext & ArvoMachineContext,
      InferServiceContract<TServiceContracts>['events'],
      InferServiceContract<TServiceContracts>['emitted'],
      InferServiceContract<TServiceContracts>['events'],
      never
    >(({ context }, param) => ({
      ...(context ?? {}),
      arvo$$: {
        ...(context?.arvo$$ ?? {}),
        volatile$$: {
          ...(context?.arvo$$?.volatile$$ ?? {}),
          eventQueue$$: [...(context?.arvo$$?.volatile$$?.eventQueue$$ || []), param],
        },
      },
    })),
  };

  // Call the original setup function with modified parameters
  const systemSetup = xstateSetup<
    TContext,
    InferServiceContract<TServiceContracts>['events'],
    // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
    {}, // No actors
    // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
    {}, // No children map
    TActions & {
      enqueueArvoEvent: EnqueueArvoEventActionParam;
    },
    TGuards,
    never, // No delays
    TTag,
    InferVersionedArvoContract<TSelfContract>['accepts']['data'],
    InferVersionedArvoContract<TSelfContract>['emits'][ReturnType<
      typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
    >]['data'],
    InferServiceContract<TServiceContracts>['emitted'],
    TMeta
  >({
    schemas: param.schemas,
    types: param.types,
    guards: param.guards as any,
    actions: combinedActions as any,
  });

  /**
   * Creates an Arvo-compatible XState machine.
   *
   * @param config - The configuration object for the machine
   * @returns An ArvoMachine instance
   *
   * @throws Error if 'invoke' or 'after' configurations are used
   *
   * @remarks
   * This function creates a state machine based on the provided configuration.
   * It performs additional checks to ensure the machine adheres to Arvo's constraints,
   * such as disallowing 'invoke' and 'after' configurations which could introduce
   * asynchronous behavior.
   * ```
   */
  const createMachine = <
    const TConfig extends MachineConfig<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
      ToProvidedActor<{}, {}>,
      ToParameterizedObject<
        TActions & {
          enqueueArvoEvent: EnqueueArvoEventActionParam;
        }
      >,
      ToParameterizedObject<TGuards>,
      never,
      TTag,
      InferVersionedArvoContract<TSelfContract>['accepts'],
      z.input<
        TSelfContract['emits'][ReturnType<
          typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
        >]
      >,
      InferServiceContract<TServiceContracts>['emitted'],
      TMeta
    >,
  >(
    config: TConfig & {
      id: string;
      version?: TSelfContract['version'];
    },
  ) => {
    const machineVersion: TSelfContract['version'] = config.version ?? param.contracts.self.version;

    if (machineVersion !== param.contracts.self.version) {
      throw new Error(
        `Version mismatch: Machine version must be '${param.contracts.self.version}' or undefined, received '${config.version}'`,
      );
    }

    const createConfigErrorMessage = (type: 'invoke' | 'after' | 'enqueueArvoEvent', path: string[]) => {
      const location = path.join(' > ');

      if (type === 'invoke') {
        return cleanString(`
          Configuration Error: 'invoke' not supported
          
          Location: ${location}
          
          Arvo machines do not support XState invocations as they introduce asynchronous behavior.
          
          To fix: Replace 'invoke' with Arvo event-driven patterns for asynchronous operations
        `);
      }

      if (type === 'after') {
        return cleanString(`
          Configuration Error: 'after' not supported
          
          Location: ${location}
          
          Arvo machines do not support delayed transitions as they introduce asynchronous behavior.
          
          To fix: Replace 'after' with Arvo event-driven patterns for time-based operations
        `);
      }

      if (type === 'enqueueArvoEvent') {
        return cleanString(`
          Configuration Error: Reserved action name 'enqueueArvoEvent'
          
          Location: ${location}
          
          'enqueueArvoEvent' is an internal Arvo system action and cannot be used in machine configurations.
          
          To fix: Use a different name for your action
        `);
      }
    };

    for (const item of getAllPaths(config.states ?? {})) {
      if (item.path.includes('invoke')) {
        throw new Error(createConfigErrorMessage('invoke', item.path));
      }
      if (item.path.includes('after')) {
        throw new Error(createConfigErrorMessage('after', item.path));
      }
      if (item.path.includes('enqueueArvoEvent')) {
        throw new Error(createConfigErrorMessage('enqueueArvoEvent', item.path));
      }
    }

    const machine = systemSetup.createMachine({
      ...(config as any),
    });

    const hasParallelStates = detectParallelStates(machine.config);
    const hasMultipleNonSystemErrorEvents = Object.values(param.contracts.services).some(
      (item) => Object.keys(item.emits).length > 1,
    );
    const requiresLocking = hasParallelStates || hasMultipleNonSystemErrorEvents;
    return new ArvoMachine<string, typeof machineVersion, TSelfContract, TServiceContracts, typeof machine>(
      config.id,
      machineVersion,
      param.contracts,
      machine,
      requiresLocking,
    );
  };
  return { createMachine };
}
