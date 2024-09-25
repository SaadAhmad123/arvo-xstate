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
import { ArvoMachineContext, ArvoMachineVersion, ToParameterizedObject, ToProvidedActor } from './types';
import {
  ArvoEvent,
  cleanString,
} from 'arvo-core';
import { getAllPaths } from '../utils/object';



/**
 * Arvo event driven system requires an orchestration mechanism which can emit
 * event base on some rules. In Arvo's opinion a good mechanism for this kind of
 * work is a state machine in with the orchestration is defined in form of a 
 * state chart. Then the state chart is interpretted by the state machine engine and
 * a next events to emit and the system state is calculated by it. 
 * 
 * The idea behind such kind of orchestration is to enable development of a very
 * simple function model where, the following can be easily achieved. The follwing
 * just for demonstrating an idea.
 * 
 * ```typescript
 * const {newSystemState, eventsToEmit} = stateMachineEngine(stateChart, currentSystemState, event)
 * ```
 * 
 * In order for this to be accomplished, the engine needs to be able to execut the events
 * syschronously and then provide the new system state and events that need to be emitted.
 * 
 * Arvo uses xstate as a state machine engine as it is the more established state machine
 * engine in the javascript/ typescript echo system and is compatible with SCXML open standard 
 * which aligns with Arvo's commitment to leveraging as many open standards as possible for
 * widespread integration. Moreover, with this, Arvo does not need to recreate a very complicate
 * piece of technology rather it levarges the xstate state machine engine, its documentation and 
 * it echo system to the fullest. Also, by leveraging xstate, Arvo can be understood by the backend
 * as well as frontend engineers and near similar system can be deployed on a frontend as well as
 * the backend.
 * 
 * However, Arvo does not allow some feature in the xstate because Arvo's state engine's assumption
 * is to be synchronous so that all the async tasks can be handled by the event handler. For this 
 * specific reason Arvo exposes xstate via a ArvoXState class with static setup function (mimiking)
 * xstate as much as possible. This `setup` function restricts the `invoke` and `after` (delayed transitions)
 * functionality as they pose a potential points to introduce ansynonicity to.
 */

/**
 * ArvoXState: A Synchronous State Machine Orchestration for Arvo Event-Driven Systems
 * 
 * Theory and Purpose:
 * ------------------
 * The Arvo event-driven system requires a robust orchestration mechanism capable of emitting
 * events based on predefined rules. ArvoXState leverages the power of state machines,
 * specifically using state charts, to provide this orchestration. This approach offers
 * several key advantages:
 * 
 * 1. Predictability: State machines provide a clear, deterministic way to model system behavior.
 * 2. Visualization: State charts can be easily visualized, aiding in system design and debugging.
 * 3. Separation of Concerns: The state logic is separated from the application logic.
 * 4. Scalability: Complex systems can be modeled as a composition of smaller, manageable state machines.
 * 
 * The core idea is to enable a simple, functional model of state transitions:
 * 
 * ```typescript
 * const {newSystemState, eventsToEmit} = stateMachineEngine(stateChart, currentSystemState, event)
 * ```
 * 
 * This model allows for synchronous execution of events, providing immediate feedback on
 * the new system state and any events that need to be emitted.
 * 
 * Why Use ArvoXState:
 * ------------------
 * 1. Leverages XState: ArvoXState builds upon XState, a well-established state machine library
 *    in the JavaScript/TypeScript ecosystem. This choice aligns with Arvo's commitment to
 *    open standards (XState is compatible with SCXML) and allows developers to tap into
 *    XState's rich ecosystem and documentation.
 * 
 * 2. Synchronous Execution: Unlike standard XState, ArvoXState enforces synchronous execution.
 *    This is crucial for Arvo's event-driven architecture, ensuring predictable and immediate
 *    state transitions.
 * 
 * 3. Restricted Functionality: ArvoXState intentionally restricts certain XState features
 *    (like 'invoke' and 'after') that could introduce asynchronicity. This ensures that
 *    all async tasks are handled by Arvo's event handlers, maintaining a clear separation
 *    of concerns.
 * 
 * 4. Cross-Platform Compatibility: By using a state machine approach, similar systems can
 *    be deployed on both frontend and backend, promoting code reuse and consistent behavior.
 * 
 * 5. Type Safety: ArvoXState maintains strong typing, leveraging TypeScript to catch potential
 *    errors at compile-time and provide excellent developer experience through autocompletion.
 * 
 * Implementation Notes:
 * --------------------
 * - The class provides a static `setup` method that mimics XState's setup but with Arvo-specific
 *   restrictions and additions.
 * - It adds an `emitArvoEvent` action to handle Arvo-specific event emission.
 * - The `createMachine` function performs additional checks to ensure no asynchronous
 *   features (like 'invoke' or 'after') are used in the machine configuration.
 * 
 * By using ArvoXState, developers can create robust, predictable, and synchronous state
 * machines that integrate seamlessly with Arvo's event-driven architecture while benefiting
 * from the power and ecosystem of XState.
 */
export default class ArvoXState {
  /**
   * Setup function for creating an Arvo-compatible XState machine.
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
      [K in keyof TGuards]: GuardPredicate<
        TContext,
        TEvent,
        TGuards[K],
        ToParameterizedObject<TGuards>
      >;
    };
  }) {

    const createConfigErrorMessage = (type: 'actor' | 'delays') => {
      return cleanString(`
        Error: Unsupported '${type}' parameter
        
        The Arvo event-driven system does not support XState actor invocations.
        
        Suggestion: Remove the '${type}' parameter from your setup configuration.
        If you need to perform asynchronous operations, consider using Arvo's
        event-driven approach instead.  
      `)
    }

    if ((param as any).actors) {
      throw new Error(createConfigErrorMessage('actor'));
    }

    if ((param as any).delays) {
      throw new Error(createConfigErrorMessage('delays'))
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
        `)
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
    })
    };

    // Call the original setup function with modified parameters
    const systemSetup = xstateSetup<
      TContext,
      TEvent,
      {}, // No actors
      {}, // No children map
      TActions & {
        emitArvoEvent: ArvoEvent,
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
      guards: param.guards,
      actions: combinedActions as any,
    });


    const createMachine = <const TConfig extends MachineConfig<
      TContext,
      TEvent,
      ToProvidedActor<{}, {}>,
      ToParameterizedObject<TActions & {
        emitArvoEvent: ArvoEvent
      }>,
      ToParameterizedObject<TGuards>,
      never,
      TTag,
      TInput,
      TOutput,
      TEmitted,
      TMeta
    >>(config: TConfig & {version: ArvoMachineVersion}) => {
      
      const createConfigErrorMessage = (type: 'invoke' | 'after', path: string[]) => {
        const location = (emphasisString: string) => path.map(item => item === emphasisString ? `**${item}**`: item).join(' > ');
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
        if (type === "after") {
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
        console.log({item})
        if (item.path.includes('invoke')) {
          throw new Error(createConfigErrorMessage('invoke', item.path))
        }
        if (item.path.includes('after')) {
          throw new Error(createConfigErrorMessage('after', item.path))
        }
      }

      return systemSetup.createMachine(config as any)
    }
    return {createMachine}
  }
}