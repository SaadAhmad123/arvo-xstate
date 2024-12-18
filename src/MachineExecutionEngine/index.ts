import { ArvoOpenTelemetry, logToSpan } from 'arvo-core';
import { ExecuteMachineInput, ExecuteMachineOutput } from './types';
import { Actor, createActor, Snapshot } from 'xstate';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { ArvoEventHandlerOpenTelemetryOptions } from 'arvo-event-handler';
import { context, SpanKind } from '@opentelemetry/api';
import { IMachineExectionEngine } from './interface';

/**
 * Handles state machine execution, event processing, and lifecycle management.
 */
export class MachineExecutionEngine implements IMachineExectionEngine {
  /**
   * Executes a state machine and manages its lifecycle.
   * 
   * @description
   * Handles machine initialization/resumption, event processing, and state transitions.
   * Manages event queues and volatile context during execution.
   * 
   * @param params Configuration parameters:
   *   - machine: State machine definition
   *   - state: Optional existing state to resume from
   *   - event: Event triggering the execution
   * @param opentelemetry Telemetry configuration for tracing
   * 
   * @returns Object containing:
   *   - state: Final machine state
   *   - events: Generated events
   *   - finalOutput: Machine output or null
   * 
   * @throws Error on invalid initialization events or execution failures
   */
  execute(
    { machine, state, event }: ExecuteMachineInput,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: "CONTEXT"
    },
  ): ExecuteMachineOutput {
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
        const errors: Error[] = [];
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
          actor.subscribe({ error: (err) => errors.push(err as Error) });
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
          actor.subscribe({ error: (err) => errors.push(err as Error) });
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
        if (errors.length) {
          throw errors[0];
        }
        return {
          state: extractedSnapshot,
          events: eventQueue,
          finalOutput: extractedSnapshot?.output ?? null,
        };
      },
    });
  };

}


