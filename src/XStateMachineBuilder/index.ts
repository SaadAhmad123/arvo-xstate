import {
  setup as xstateSetup,
  MachineContext,
  AnyEventObject,
  ParameterizedObject,
  MetaObject,
  NonReducibleUnknown,
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
import { cleanString, exceptionToSpan } from 'arvo-core';
import { getAllPaths } from '../utils/object';
import { ArvoXStateTracer } from '../OpenTelemetry';
import {
  context as otelcontext,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

/**
 * XStateMachineBuilder: Synchronous State Machine Orchestration for Arvo Event-Driven Systems
 *
 * @description
 * Leverages XState to provide a synchronous state machine implementation
 * for Arvo's event-driven architecture. This class restricts asynchronous features
 * to maintain predictable state transitions and integrates with OpenTelemetry for tracing.
 *
 * @remarks
 * This class is designed to work within the Arvo ecosystem, providing a way to create
 * state machines that are compatible with Arvo's event-driven approach. It enforces
 * certain constraints to ensure that the resulting machines behave predictably in a
 * synchronous environment.
 *
 * @example
 * ```typescript
 * const builder = new XStateMachineBuilder();
 * const { createMachine } = builder.setup({
 *   types: {...},
 *   actions: {...},
 *   guards: {...}
 * });
 *
 * const machine = createMachine({
 *   version: '1.0.0',
 *   // ... machine configuration
 * });
 * ```
 */
export default class XStateMachineBuilder {
  /**
   * Creates an Arvo-compatible XState machine setup.
   *
   * @param param - Configuration object for the machine setup
   * @returns Object with createMachine function
   *
   * @throws Error if 'actors', 'delays', or reserved action names are used
   *
   * @typeParam TContext - The type of the machine's context
   * @typeParam TEvent - The type of events the machine can receive
   * @typeParam TActions - The type of actions the machine can perform
   * @typeParam TGuards - The type of guards the machine can use
   * @typeParam TTag - The type of tags that can be used in the machine
   * @typeParam TInput - The type of input the machine can receive
   * @typeParam TOutput - The type of output the machine can produce
   * @typeParam TEmitted - The type of events the machine can emit
   * @typeParam TMeta - The type of metadata that can be attached to states
   *
   * @remarks
   * This method sets up the foundation for creating Arvo-compatible state machines.
   * It includes built-in actions like `enqueueArvoEvent` and performs various checks
   * to ensure the configuration adheres to Arvo's constraints.
   */
  public setup<
    TContext extends MachineContext,
    TEvent extends AnyEventObject,
    TActions extends Record<
      string,
      ParameterizedObject['params'] | undefined
    > = {},
    TGuards extends Record<
      string,
      ParameterizedObject['params'] | undefined
    > = {},
    TTag extends string = string,
    TInput = NonReducibleUnknown,
    TOutput extends NonReducibleUnknown = NonReducibleUnknown,
    TEmitted extends AnyEventObject = AnyEventObject,
    TMeta extends MetaObject = MetaObject,
  >(param: {
    schemas?: unknown;
    types?: SetupTypes<
      TContext,
      TEvent,
      {},
      TTag,
      TInput,
      TOutput,
      TEmitted,
      TMeta
    >;
    actions?: {
      [K in keyof TActions]: ActionFunction<
        TContext,
        TEvent,
        TEvent,
        TActions[K],
        never,
        ToParameterizedObject<TActions>,
        ToParameterizedObject<TGuards>,
        never,
        TEmitted
      >;
    };
    guards?: {
      [K in keyof TGuards]: (
        args: {
          context: TContext;
          event: TEvent;
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
            TEvent,
            EnqueueArvoEventActionParam,
            TEvent,
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
          TEvent,
          {}, // No actors
          {}, // No children map
          TActions & {
            enqueueArvoEvent: EnqueueArvoEventActionParam;
          },
          TGuards,
          never, // No delays
          TTag,
          TInput,
          TOutput,
          TEmitted,
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
            TEvent,
            ToProvidedActor<{}, {}>,
            ToParameterizedObject<
              TActions & {
                enqueueArvoEvent: EnqueueArvoEventActionParam;
              }
            >,
            ToParameterizedObject<TGuards>,
            never,
            TTag,
            TInput,
            TOutput,
            TEmitted,
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

                return systemSetup.createMachine(config as any);
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
}
