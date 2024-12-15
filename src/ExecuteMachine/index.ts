import { ArvoOpenTelemetry, logToSpan } from 'arvo-core';
import { ExecuteMachineInput, ExecuteMachineOutput } from './types';
import { Actor, createActor, Snapshot } from 'xstate';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { ArvoEventHandlerOpenTelemetryOptions } from 'arvo-event-handler';
import { context, SpanKind } from '@opentelemetry/api';

/**
 * Executes a state machine with the provided configuration and returns its execution results.
 *
 * @description
 * This function handles both the initialization of new machines and the resumption of existing ones.
 * It manages the machine's lifecycle, event queue, and state transitions while providing detailed logging.
 *
 * The function performs the following main tasks:
 * 1. Initializes or resumes a state machine based on provided state
 * 2. Handles event processing and queuing
 * 3. Manages machine execution and state transitions
 * 4. Processes volatile context and cleanup
 *
 * @param params - The input parameters for machine execution
 *
 * @returns Object containing:
 *   - state: The final state snapshot
 *   - events: Array of queued events generated during execution
 *   - finalOutput: The machine's final output or null
 *
 * @throws {Error} Throws when initialization event type doesn't match machine's
 *                 source or some machine error
 */
export const executeMachine = (
  { machine, state, event }: ExecuteMachineInput,
  opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
    inheritFrom: 'CONTEXT',
  },
): ExecuteMachineOutput => {
  return ArvoOpenTelemetry.getInstance().startActiveSpan({
    name: 'Execute Machine',
    spanOptions: {
      kind: SpanKind.INTERNAL,
      attributes: {
        'arvo.machine.type': machine.source,
        'arvo.machine.version': machine.version,
        ...event.otelAttributes,
      },
    },
    context:
      opentelemetry.inheritFrom === 'EVENT'
        ? {
            inheritFrom: 'TRACE_HEADERS',
            traceHeaders: {
              traceparent: event.traceparent,
              tracestate: event.tracestate,
            },
          }
        : {
            inheritFrom: 'CONTEXT',
            context: context.active(),
          },
    fn: () => {
      const eventQueue: EnqueueArvoEventActionParam[] = [];
      let actor: Actor<typeof machine.logic>;
      if (!state) {
        logToSpan({
          level: 'INFO',
          message: `Starting new orchestration for machine '${machine.source}' with event type '${event.type}'`,
        });
        if (event.type !== machine.source) {
          throw new Error(
            `Invalid initialization event: Machine requires source event '${machine.source}' to start, but received event '${event.type}' instead. This likely indicates a mismatch between the expected workflow trigger and the actual event sent.`,
          );
        }
        actor = createActor(machine.logic, {
          input: event.toJSON(),
        });
        actor.on('*', (event) =>
          eventQueue.push(event as EnqueueArvoEventActionParam),
        );
        actor.subscribe({ error: () => {} });
        actor.start();
      } else {
        logToSpan({
          level: 'INFO',
          message: `Resuming orchestration for machine '${machine.source}' from existing state with event '${event.type}'`,
        });
        actor = createActor(machine.logic, {
          snapshot: state,
        });
        actor.on('*', (event) =>
          eventQueue.push(event as EnqueueArvoEventActionParam),
        );
        actor.subscribe({ error: () => {} });
        actor.start();
        actor.send(event.toJSON());
      }
      logToSpan({
        level: 'INFO',
        message: `Machine '${machine.source}' execution completed successfully with ${eventQueue.length} queued events`,
      });
      logToSpan({
        level: 'INFO',
        message: `Extracting final state snapshot from machine '${machine.source}'`,
      });
      const extractedSnapshot = actor.getPersistedSnapshot() as Snapshot<any>;
      if ((extractedSnapshot as any)?.context?.arvo$$?.volatile$$) {
        (
          (extractedSnapshot as any)?.context?.arvo$$?.volatile$$
            ?.eventQueue$$ as EnqueueArvoEventActionParam[]
        ).forEach((item) => eventQueue.push(item));
        delete (extractedSnapshot as any).context.arvo$$.volatile$$;
      }
      return {
        state: extractedSnapshot,
        events: eventQueue,
        finalOutput: extractedSnapshot?.output ?? null,
      };
    },
  });
};
