import type { ArvoEvent } from 'arvo-core';
import type { AbstractArvoEventHandler } from 'arvo-event-handler';
import { SimpleEventBroker } from '.';

/**
 * Factory for creating local event brokers with domain event handlers.
 *
 * @param eventHandlers - Handlers to register with the broker
 * @param onError - Optional custom error handler
 * @returns Configured event broker
 *
 * @example
 * ```typescript
 * const broker = createSimpleEventBroker([
 *   new OrderValidationHandler(),
 *   new OrderProcessingHandler()
 * ]);
 *
 * await broker.publish({
 *   to: 'order.validate',
 *   payload: orderData
 * });
 * ```
 */
export const createSimpleEventBroker = (
  eventHandlers: AbstractArvoEventHandler[],
  onError?: (error: Error, event: ArvoEvent) => void,
) => {
  const broker = new SimpleEventBroker({
    maxQueueSize: 1000,
    errorHandler:
      onError ??
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
        const { events: resultEvents } = await handler.execute(event, {
          inheritFrom: 'EVENT',
        });
        // Propagate any resulting events
        // biome-ignore lint/complexity/noForEach: TODO - fix later
        resultEvents.forEach((resultEvent) => broker.publish(resultEvent));
      },
      true,
    );
  });

  return broker;
};
