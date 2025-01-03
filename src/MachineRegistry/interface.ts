import { ArvoEvent } from 'arvo-core';
import { ArvoEventHandlerOpenTelemetryOptions } from 'arvo-event-handler';
import ArvoMachine from '../ArvoMachine';

/**
 * Interface for managing and resolving state machine instances.
 */
export interface IMachineRegistry {
  /**
   * Collection of registered machine instances.
   * Each machine should have a unique combination of version and source.
   */
  machines: ArvoMachine<any, any, any, any, any>[];

  /**
   * Resolves a machine instance based on event information.
   *
   * @param event - Event containing orchestration subject information
   * @param opentelemetry - Configuration for telemetry and tracing
   * @returns Matching ArvoMachine instance for the event
   */
  resolve: (
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions,
  ) => ArvoMachine<any, any, any, any, any>;
}
