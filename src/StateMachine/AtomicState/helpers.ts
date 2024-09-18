import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AtomicState } from '.';
import { ArvoStateEngineTracer } from '../../OpenTelemetry';
import Transition from '../Transition';
import { StateMachineContext } from '../types';
import { IAtomicState } from './types';
import { exceptionToSpan } from 'arvo-core';

/**
 * Creates an AtomicState instance with the provided configuration.
 *
 * @template TContext - The type of the state machine context.
 * @param param - The configuration object for the AtomicState.
 * @returns A new instance of AtomicState.
 *
 * @throws {Error} If both 'always' and 'on' transitions are defined.
 * @throws {Error} If the state is non-final and has neither 'always' nor 'on' transitions defined.
 *
 * @remarks
 * This function allows creating an AtomicState with either 'on' or 'always' transitions, but not both.
 * Otherwise, an error is thrown. Moreover, this function integrated with opentelemetry.
 *
 * @example
 * ```typescript
 * const myState = createAtomicState<MyContext>({
 *   description: "My Atomic State",
 *   entry: { someAction: ({context}) => { ... } },
 *   on: {
 *     SOME_EVENT: createTransition(...)
 *   }
 * });
 * ```
 *
 * * @example
 * ```typescript
 * const myAlwaysState = createAtomicState<MyContext>({
 *   description: "My Always State",
 *   entry: { someAction: ({context}) => { ... } },
 *   always: createTransition(...)
 * });
 * ```
 */
export const createAtomicState = <TContext extends StateMachineContext>(
  param: IAtomicState<TContext>,
) => {
  const span = ArvoStateEngineTracer.startSpan(`createAtomicState`, {});
  return context.with(trace.setSpan(context.active(), span), () => {
    span.setStatus({ code: SpanStatusCode.OK });
    try {
      return new AtomicState<TContext>({
        ...param,
        on: (
          param as Omit<IAtomicState<TContext>, 'always'> & {
            on: Record<string, Transition<TContext>>;
          }
        ).on,
        always: (
          param as Omit<IAtomicState<TContext>, 'on'> & {
            always: Transition<TContext>;
          }
        ).always,
      });
    } catch (error) {
      exceptionToSpan(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
};
