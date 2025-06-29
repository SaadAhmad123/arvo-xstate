import type { ArvoEvent } from 'arvo-core';
import type { AbstractArvoEventHandler } from 'arvo-event-handler';
import { SimpleEventBroker } from '.';

/**
 * Creates a local event broker configured with domain event handlers.
 *
 * The broker automatically wires each handler to its source topic and propagates
 * resulting events. Includes default error handling with console logging.
 *
 * @param eventHandlers - Array of event handlers to register with the broker
 * @param options - Configuration options
 * @param options.onError - Custom error handler for broker errors
 * @param options.onDomainedEvents - Callback for handling domain-specific events
 * @returns Configured SimpleEventBroker instance with handlers subscribed
 *
 * @example
 * ```typescript
 * const broker = createSimpleEventBroker([
 *   createArvoOrchestrator(...),
 *   createArvoEventHandler(...)
 * ]);
 *
 * await broker.publish(createArvoEvent({
 *    type: 'com.openai.completion',
 *    data: {...}
 * }));
 * ```
 */
export const createSimpleEventBroker = (
  eventHandlers: AbstractArvoEventHandler[],
  options?: {
    onError?: (error: Error, event: ArvoEvent) => void;
    onDomainedEvents?: (param: {
      events: Record<string, ArvoEvent[]>;
      broker: SimpleEventBroker;
    }) => void;
  },
) => {
  const broker = new SimpleEventBroker({
    maxQueueSize: 1000,
    errorHandler:
      options?.onError ??
      ((error, event) => {
        console.error('Broker error:', {
          message: error.message,
          eventType: event.to,
          event,
        });
      }),
  });

  // Wire up each handler to its source topic
  // biome-ignore lint/complexity/noForEach: TODO - fix later
  eventHandlers.forEach((handler) => {
    broker.subscribe(
      handler.source,
      async (event) => {
        const response = await handler.execute(event, {
          inheritFrom: 'EVENT',
        });
        // Emit the domained events
        if (response.domainedEvents && typeof response.domainedEvents === 'object') {
          const { all, ...rest } = response.domainedEvents as Record<string, ArvoEvent[]>;
          options?.onDomainedEvents?.({
            events: rest,
            broker: broker,
          });
        }
        // Propagate any resulting events
        // biome-ignore lint/complexity/noForEach: TODO - fix later
        response.events.forEach((e) => broker.publish(e));
      },
      true,
    );
  });

  return broker;
};
