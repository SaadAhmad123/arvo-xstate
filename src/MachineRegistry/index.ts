import {
  ArvoEvent,
  ArvoOpenTelemetry,
  ArvoOrchestrationSubject,
  logToSpan,
} from 'arvo-core';
import ArvoMachine from '../ArvoMachine';
import { ArvoEventHandlerOpenTelemetryOptions } from 'arvo-event-handler';
import { context, SpanKind } from '@opentelemetry/api';
import { IMachineRegistry } from './interface';

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
   * @returns The matching ArvoMachine instance
   * @throws {Error} When no matching machine is found in the registry
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
  ): ArvoMachine<any, any, any, any, any> {
    return ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `Resolve Machine`,
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
        span.setAttribute(
          'arvo.parsed.subject.orchestrator.name',
          subject.orchestrator.name,
        );
        span.setAttribute(
          'arvo.parsed.subject.orchestrator.version',
          subject.orchestrator.version,
        );
        let machine: ArvoMachine<any, any, any, any, any> | null =
          this.machines.filter(
            (item) =>
              item.version === subject.orchestrator.version &&
              item.source === subject.orchestrator.name,
          )[0] ?? null;
        if (!machine) {
          throw new Error(
            `Machine resolution failed: No machine found matching orchestrator name='${subject.orchestrator.name}' and version='${subject.orchestrator.version}'`,
          );
        }
        logToSpan({
          level: 'INFO',
          message: `Recolved machine for type`,
        });
        return machine;
      },
    });
  }
}
