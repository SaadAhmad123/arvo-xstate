import { ArvoEvent } from 'arvo-core';
import { SimpleEventBroker } from '.';
import { AbstractArvoEventHandler } from 'arvo-event-handler';

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
    errorHandler: onError ?? ((error, event) => {
      console.error('Broker error:', {
        message: error.message,
        eventType: event.to,
        event,
      });
    }),
  });
 
  // Wire up each handler to its source topic
  eventHandlers.forEach((handler) => {
    broker.subscribe(handler.source, async (event) => {
      const resultEvents = await handler.execute(event, {
        inheritFrom: "EVENT"
      });
      // Propagate any resulting events
      resultEvents.forEach(resultEvent => broker.publish(resultEvent));
    });
  });
 
  return broker;
 };
