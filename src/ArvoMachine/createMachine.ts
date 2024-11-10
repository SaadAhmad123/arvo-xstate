import {
  setup as xstateSetup,
  MachineContext,
  ParameterizedObject,
  MetaObject,
  ActionFunction,
  SetupTypes,
  assign,
  MachineConfig,
} from 'xstate';
import {
  ArvoMachineContext,
  EnqueueArvoEventActionParam,
  ToParameterizedObject,
  ToProvidedActor,
} from './types';
import {
  ArvoContract,
  ArvoOrchestratorContract,
  cleanString,
  InferArvoContract,
  InferArvoOrchestratorContract,
  ArvoOrchestratorVersion,
  ArvoEvent,
} from 'arvo-core';
import { getAllPaths } from '../utils/object';
import { z } from 'zod';
import ArvoMachine from '.';

type InferServiceContract<T extends Record<string, ArvoContract>> = {
  // All the events that can be emitted by the orchestrator
  emitted: {
    [K in keyof T]: EnqueueArvoEventActionParam<
      z.infer<T[K]['accepts']['schema']>,
      T[K]['accepts']['type']
    >;
  }[keyof T];

  // All the events that can be recieved by the orchestrator
  events: {
    [K in keyof T]: InferArvoContract<T[K]>['emittableEvents'];
  }[keyof T];
};

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
 *   name: 'llm',
 *   schema: {
 *     init: z.object({
 *       request: z.string(),
 *       llm: z.enum(['gpt-4', 'gpt-4o']),
 *     }),
 *     complete: z.object({
 *       response: z.string(),
 *     })
 *   }
 * })
 *
 * // Define the OpenAI service contract
 * const openAiContract = createArvoContract({
 *   uri: `#/services/openai`,
 *   accepts: {
 *     type: 'com.openai.completions',
 *     schema: z.object({
 *       request: z.string(),
 *     })
 *   },
 *   emits: {
 *     'evt.openai.completions.success': z.object({
 *       response: z.string(),
 *     })
 *   }
 * })
 *
 * const machineId = 'machineV100'
 *
 * // Set up the Arvo machine
 * const llmMachine = setupArvoMachine({
 *   contracts: {
 *     self: llmContract,
 *     services: {
 *       openAiContract,
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
 *   version: '1.0.0',
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
 *            actions: [
 *               assign({response: ({event}) => event.response})
 *            ],
 *            target: 'done'
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
  TSelfContract extends ArvoOrchestratorContract,
  TServiceContracts extends Record<string, ArvoContract>,
  TActions extends Record<
    string,
    ParameterizedObject['params'] | undefined
  > = {},
  TGuards extends Record<
    string,
    ParameterizedObject['params'] | undefined
  > = {},
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
      {},
      TTag,
      InferArvoOrchestratorContract<TSelfContract>['init']['data'],
      InferArvoOrchestratorContract<TSelfContract>['complete']['data'],
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
          Error: Unsupported '${type}' parameter
          
          The Arvo event-driven system does not support XState actor invocations.
          
          Suggestion: Remove the '${type}' parameter from your setup configuration.
          If you need to perform asynchronous operations, consider using Arvo's
          event-driven approach instead.  
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
            Error: Reserved action name 'enqueueArvoEvent'
            
            The action name 'enqueueArvoEvent' is reserved for internal use in the Arvo system.
            
            Suggestion: Choose a different name for your action. For example:
            - 'sendCustomEvent'
            - 'triggerArvoAction'
            - 'dispatchArvoEvent'
          `),
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
          eventQueue$$: [
            ...(context?.arvo$$?.volatile$$?.eventQueue$$ || []),
            param,
          ],
        },
      },
    })),
  };

  // Call the original setup function with modified parameters
  const systemSetup = xstateSetup<
    TContext,
    InferServiceContract<TServiceContracts>['events'],
    {}, // No actors
    {}, // No children map
    TActions & {
      enqueueArvoEvent: EnqueueArvoEventActionParam;
    },
    TGuards,
    never, // No delays
    TTag,
    InferArvoOrchestratorContract<TSelfContract>['init']['data'],
    InferArvoOrchestratorContract<TSelfContract>['complete']['data'],
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
      ToProvidedActor<{}, {}>,
      ToParameterizedObject<
        TActions & {
          enqueueArvoEvent: EnqueueArvoEventActionParam;
        }
      >,
      ToParameterizedObject<TGuards>,
      never,
      TTag,
      InferArvoOrchestratorContract<TSelfContract>['init'],
      z.input<TSelfContract['complete']['schema']>,
      InferServiceContract<TServiceContracts>['emitted'],
      TMeta
    >,
  >(
    config: TConfig & {
      id: string;
      version: ArvoOrchestratorVersion;
    },
  ) => {
    const createConfigErrorMessage = (
      type: 'invoke' | 'after' | 'enqueueArvoEvent',
      path: string[],
    ) => {
      const location = (emphasisString: string) => path.join(' > ');
      if (type === 'invoke') {
        return cleanString(`
              Error: Unsupported 'invoke' configuration
              
              Location: ${location('invoke')}
              
              The Arvo XState variant does not allow asynchronous invocation of functions or actors.
              
              Suggestion: Remove the 'invoke' configuration and use Arvo's event-driven
              approach for handling asynchronous operations. Consider using actions to
              emit events that trigger the desired behavior.
            `);
      }
      if (type === 'after') {
        return cleanString(`
              Error: Unsupported 'after' configuration
              
              Location: ${location('after')}
              
              The Arvo XState variant does not support delayed transitions, which cause
              asynchronous machine interpretation.
              
              Suggestion: Remove the 'after' configuration and use Arvo's event-driven
              approach for time-based behavior. Consider using a different timed events 
              strategy for delayed actions.
            `);
      }
      if (type === 'enqueueArvoEvent') {
        return cleanString(`
          Error: Unsupported 'enqueueArvoEvent' configuration

          Location: ${location('enqueueArvoEvent')}

          The action name 'enqueueArvoEvent' is reserved for internal use in the Arvo system.
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
        throw new Error(
          createConfigErrorMessage('enqueueArvoEvent', item.path),
        );
      }
    }

    const machine = systemSetup.createMachine({
      ...(config as any),
    });
    return new ArvoMachine(config.id, config.version, param.contracts, machine);
  };
  return { createMachine };
}
