import {
  setup as xstateSetup,
  MachineContext,
  AnyEventObject,
  ParameterizedObject,
  MetaObject,
  ActionFunction,
  SetupTypes,
  assign,
  MachineConfig,
} from 'xstate';
import {
  ArvoMachineContext,
  ArvoMachineVersion,
  EnqueueArvoEventActionParam,
  ToParameterizedObject,
  ToProvidedActor,
} from './types';
import { ArvoContract, ArvoOrchestratorContract, cleanString, exceptionToSpan, InferArvoContract, InferArvoOrchestratorContract } from 'arvo-core';
import { getAllPaths } from '../utils/object';
import { ArvoXStateTracer } from '../OpenTelemetry';
import {
  context as otelcontext,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { z } from 'zod';

type InferServiceContract<T extends Record<string, ArvoContract>> = {
  // All the events that can be emitted by the orchestrator
  emitted: { [K in keyof T]: EnqueueArvoEventActionParam<
      z.infer<T[K]['accepts']['schema']>,
      T[K]['accepts']['type']
  > }[keyof T],

  // All the events that can be recieved by the orchestrator
  events: { [K in keyof T]: InferArvoContract<T[K]>['emittableEvents'] }[keyof T]
}


/**
 * This method sets up the foundation for creating Arvo-compatible state machines definition.
 * It includes built-in actions like `enqueueArvoEvent` and performs various checks
 * to ensure the configuration adheres to Arvo's constraints.
 * 
 * @param param - Configuration object for the machine setup
 * @returns Object with createMachine function
 * @throws Error if 'actors', 'delays', or reserved action names are used
 * 
 * @description
 * ArvoMachine is Synchronous State Machine Orchestration for Arvo Event-Driven Systems
 * 
 * It leverages XState to provide a synchronous state machine implementation
 * for Arvo's event-driven architecture. This class restricts asynchronous features
 * to maintain predictable state transitions and integrates with OpenTelemetry for tracing.
 * 
 * @remarks
 * Since this function is a variant of the `setup` and `createMachine` of XState, 
 * you can find more information on the paramerters of these functions there. The
 * documentation on both can be found [here](https://stately.ai/docs/setup) and the 
 * 
 * @example
 * ```typescript
 * import { setupArvoMachine } from 'arvo-xstate'
 * import { createArvoOrchestratorContract, ArvoErrorSchema } from 'arvo-core'
 * import { z } from 'zod'
 * 
 * const llmContract = createArvoOrchestratorContract({
 *  uri: `#/orchestrators/llm/`,
 *  name: 'llm',
 *  schema: {
 *    init: z.object({
 *      request: z.string(),
 *      llm: z.enum(['gpt-4', 'gpt-4o']),
 *    }),
 *    complete: z.object({
 *      response: z.string(),
 *    })
 *  }
 * })
 * 
 * const llmMachine = setupArvoMachine({
 *  constract: llmContract
 *  types: {
 *    // Similar to xstata setup
 *    context: {} as {
 *      request: string,
 *      llm: string,
 *      response: string | null,
 *      errors: ArvoErrorSchema[]
 *    }, 
 *    // Similar to xstata setup
 *    events: {} as any,
 *    // Similar to xstata setup [here](https://stately.ai/docs/tags)
 *    tags: {} as 'pending' | 'success' | 'error',
 *    
 *    
 *    
 *  },
 *  actions: {...},
 *  guards: {...}
 * }).createMachine({
 *   version: '1.0.0',
 *   // ... machine configuration
 * });
 * ```
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
      self: TSelfContract,
      // Definition of all the services the orchestrator talks to and 
      // send and/or recieves events from
      services: TServiceContracts,
    },
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
      "input" | "output" | "children" | "emitted"
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
    const span = ArvoXStateTracer.startSpan(`ArvoXState.machine.setup`, {});
    return otelcontext.with(trace.setSpan(otelcontext.active(), span), () => {
      try {
        span.setStatus({ code: SpanStatusCode.OK });
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
          >(({ context }, param) => {
            const span = ArvoXStateTracer.startSpan(
              `enqueueArvoEvent<${param.type}>`,
              {},
            );
            return otelcontext.with(
              trace.setSpan(otelcontext.active(), span),
              () => {
                try {
                  span.setStatus({ code: SpanStatusCode.OK });
                  return {
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
                  };
                } catch (e) {
                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: (e as Error).message,
                  });
                  exceptionToSpan(e as Error);
                  throw e;
                } finally {
                  span.end();
                }
              },
            );
          }),
        };

        // Call the original setup function with modified parameters
        const systemSetup = xstateSetup<
          TContext,
          InferServiceContract<TServiceContracts>['events'],
          {}, // No actors
          {}, // No children map
          TActions & {
            enqueueArvoEvent: InferServiceContract<TServiceContracts>['emitted'];
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
         * @returns An XState machine instance
         *
         * @throws Error if 'invoke' or 'after' configurations are used
         *
         * @remarks
         * This function creates a state machine based on the provided configuration.
         * It performs additional checks to ensure the machine adheres to Arvo's constraints,
         * such as disallowing 'invoke' and 'after' configurations which could introduce
         * asynchronous behavior.
         *
         * @example
         * ```typescript
         * const machine = createMachine({
         *   version: '1.0.0',
         *   id: 'myMachine',
         *   initial: 'idle',
         *   states: {
         *     idle: {
         *       on: {
         *         START: 'active'
         *       }
         *     },
         *     active: {
         *       // ...
         *     }
         *   }
         * });
         * ```
         */
        const createMachine = <
          const TConfig extends MachineConfig<
            TContext,
            InferServiceContract<TServiceContracts>['events'],
            ToProvidedActor<{}, {}>,
            ToParameterizedObject<
              TActions & {
                enqueueArvoEvent: InferServiceContract<TServiceContracts>['emitted'];
              }
            >,
            ToParameterizedObject<TGuards>,
            never,
            TTag,
            InferArvoOrchestratorContract<TSelfContract>['init']['data'],
            InferArvoOrchestratorContract<TSelfContract>['complete']['data'],
            InferServiceContract<TServiceContracts>['emitted'],
            TMeta
          >,
        >(
          config: TConfig & { version: ArvoMachineVersion },
        ) => {
          const span = ArvoXStateTracer.startSpan(
            'ArvoXState.machine.setup(...).createMachine',
            {},
          );
          return otelcontext.with(
            trace.setSpan(otelcontext.active(), span),
            () => {
              try {
                const createConfigErrorMessage = (
                  type: 'invoke' | 'after',
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
                };

                for (const item of getAllPaths(config)) {
                  if (item.path.includes('invoke')) {
                    throw new Error(
                      createConfigErrorMessage('invoke', item.path),
                    );
                  }
                  if (item.path.includes('after')) {
                    throw new Error(
                      createConfigErrorMessage('after', item.path),
                    );
                  }
                }

                const machine = systemSetup.createMachine(config as any);
                return machine as ((typeof machine) & {version: ArvoMachineVersion})
              } catch (e) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: (e as Error).message,
                });
                exceptionToSpan(e as Error);
                throw e;
              } finally {
                span.end();
              }
            },
          );
        };
        return { createMachine };
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (e as Error).message,
        });
        exceptionToSpan(e as Error);
        throw e;
      } finally {
        span.end();
      }
    });
  }
