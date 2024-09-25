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
import { GuardPredicate } from 'xstate/dist/declarations/src/guards';
import {
  ArvoMachineContext,
  ArvoMachineVersion,
  ToParameterizedObject,
  ToProvidedActor,
} from './types';
import { ArvoEvent, cleanString } from 'arvo-core';
import { getAllPaths } from '../utils/object';

/**
 * ArvoXState: Synchronous State Machine Orchestration for Arvo Event-Driven Systems
 *
 * @description
 * Leverages XState to provide a synchronous state machine implementation
 * for Arvo's event-driven architecture. Restricts asynchronous features
 * to maintain predictable state transitions.
 */
export default class ArvoXState {
  /**
   * Creates an Arvo-compatible XState machine setup.
   *
   * @param param - Configuration object for the machine setup
   * @returns Object with createMachine function
   *
   * @throws Error if 'actors', 'delays', or reserved action names are used
   */
  static setup<
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

    if (param.actions?.emitArvoEvent) {
      throw new Error(
        cleanString(`
          Error: Reserved action name 'emitArvoEvent'
          
          The action name 'emitArvoEvent' is reserved for internal use in the Arvo system.
          
          Suggestion: Choose a different name for your action. For example:
          - 'sendCustomEvent'
          - 'triggerArvoAction'
          - 'dispatchArvoEvent'
        `),
      );
    }

    const combinedActions = {
      ...((param.actions ?? {}) as typeof param.actions),
      emitArvoEvent: assign<
        TContext & ArvoMachineContext,
        TEvent,
        ArvoEvent,
        TEvent,
        never
      >(({ context }, param) => {
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
      }),
    };

    // Call the original setup function with modified parameters
    const systemSetup = xstateSetup<
      TContext,
      TEvent,
      {}, // No actors
      {}, // No children map
      TActions & {
        emitArvoEvent: ArvoEvent;
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

    const createMachine = <
      const TConfig extends MachineConfig<
        TContext,
        TEvent,
        ToProvidedActor<{}, {}>,
        ToParameterizedObject<
          TActions & {
            emitArvoEvent: ArvoEvent;
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
      const createConfigErrorMessage = (
        type: 'invoke' | 'after',
        path: string[],
      ) => {
        const location = (emphasisString: string) =>
          path
            .map((item) => (item === emphasisString ? `**${item}**` : item))
            .join(' > ');
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
          throw new Error(createConfigErrorMessage('invoke', item.path));
        }
        if (item.path.includes('after')) {
          throw new Error(createConfigErrorMessage('after', item.path));
        }
      }

      return systemSetup.createMachine(config as any);
    };
    return { createMachine };
  }
}
