import { SpanKind, context } from '@opentelemetry/api';
import { type ArvoEvent, ArvoOpenTelemetry, ArvoOrchestrationSubject, logToSpan } from 'arvo-core';
import type { ArvoEventHandlerOpenTelemetryOptions } from 'arvo-event-handler';
import type ArvoMachine from '../ArvoMachine';
import type { IMachineRegistry } from './interface';

/**
 * Registry for managing and resolving ArvoMachine instances.
 * Provides functionality to store multiple machine instances and resolve them based on events.
 *
 * @remarks
 * The registry must contain at least one machine upon initialization.
 * Each machine in the registry should have a unique combination of version and source.
 */
export class MachineRegistry implements IMachineRegistry {
  public machines: ArvoMachine<any, any, any, any, any>[];

  /**
   * Creates a new MachineRegistry instance with the provided machines.
   *
   * @param args - Variable number of ArvoMachine instances to register
   * @throws {Error} When no machines are provided during initialization
   */
  constructor(...args: ArvoMachine<any, any, any, any, any>[]) {
    this.machines = args;
    if (!this.machines.length) {
      throw new Error(
        'Machine registry initialization failed: No machines provided. At least one machine must be registered.',
      );
    }
  }

  /**
   * Resolves and returns a machine instance based on the provided event.
   * The resolution is performed using the orchestrator information in the event's subject.
   *
   * @param event - The event containing orchestration subject information
   * @param opentelemetry Telemetry configuration for tracing
   * @returns The matching ArvoMachine instance or null if not found
   *
   * @example
   * ```typescript
   * const machine = registry.resolve(incomingEvent);
   * // Use resolved machine for event processing
   * ```
   */
  resolve(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'CONTEXT',
    },
  ): ArvoMachine<any, any, any, any, any> | null {
    return ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'Resolve Machine',
      spanOptions: {
        kind: SpanKind.INTERNAL,
        attributes: event.otelAttributes,
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
      fn: (span) => {
        const subject = ArvoOrchestrationSubject.parse(event.subject);
        const { name, version } = subject.orchestrator;
        span.setAttributes({
          'arvo.parsed.subject.orchestrator.name': name,
          'arvo.parsed.subject.orchestrator.version': version,
        });
        const machine = this.machines.find((item) => item.version === version && item.source === name) ?? null;
        logToSpan({
          level: machine ? 'INFO' : 'WARNING',
          message: machine ? `Resolved machine for type ${name}@${version}` : `No machine found for ${name}@${version}`,
        });
        return machine;
      },
    });
  }
}
