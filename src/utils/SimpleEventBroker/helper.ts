import type { ArvoEvent } from 'arvo-core';
import type { AbstractArvoEventHandler } from 'arvo-event-handler';
import { SimpleEventBroker } from '.';

/**
 * Creates a local event broker configured with domain event handlers and provides event resolution capabilities
 *
 * This factory function establishes a comprehensive event-driven architecture within a single process,
 * automatically wiring event handlers to their source topics and providing sophisticated event propagation
 * with domain-specific routing capabilities. The broker implements sequential queue-based processing
 * with built-in error handling and observability features.
 *
 * **Core Architecture:**
 * The broker acts as an in-memory event bus that connects ArvoResumable orchestrators, ArvoOrchestrator
 * state machines, and ArvoEventHandler services in a unified event-driven system. This enables
 * local testing of distributed workflows and provides a foundation for event-driven microservices.
 *
 * **Event Processing Flow:**
 * 1. Events are published to handler source topics
 * 2. Handlers execute and produce response events
 * 3. Domain-specific events are routed through onDomainedEvents callback
 * 4. Default domain events are automatically propagated through the broker
 * 5. Event chains continue until all handlers complete processing
 *
 * @param eventHandlers - Array of event handlers to register with the broker. Each handler is automatically
 *                        subscribed to its source topic and executed when matching events are received.
 *                        Supports ArvoResumable, ArvoOrchestrator, and ArvoEventHandler instances.
 *
 * @param options - Optional configuration for customizing broker behavior and event processing
 * @param options.onError - Custom error handler invoked when processing failures occur. Receives the error
 *                          and triggering event for logging, monitoring, or recovery actions. Defaults to
 *                          console.error with structured event information for debugging.
 * @param options.onDomainedEvents - Callback for processing domain-specific events produced by handlers.
 *                                   Enables custom routing logic, external system integration, or
 *                                   domain-specific event processing patterns. Receives events grouped
 *                                   by domain (excluding 'all') and the broker instance for republishing.
 *
 * @returns Configuration object containing the broker instance and event resolution function
 * @returns result.broker - Configured SimpleEventBroker with all handlers subscribed and ready for processing
 * @returns result.resolve - Async function that executes complete event processing chains and returns
 *                           the final resolved event. Returns null if resolution fails or handler is not found
 *                           for an intermetiate event.
 *
 * @throws {Error} When event source conflicts with registered handler sources during resolution
 *
 * @example
 * **Basic Event-Driven Architecture Setup:**
 * ```typescript
 * const userHandler = createArvoEventHandler({
 *   contract: userContract,
 *   handler: { '1.0.0': async ({ event }) => ({ type: 'user.processed', data: event.data }) }
 * });
 *
 * const orderOrchestrator = createArvoResumable({
 *   contracts: { self: orderContract, services: { user: userContract } },
 *   handler: {
 *     '1.0.0': async ({ init, service }) => {
 *       if (init) return { services: [{ type: 'user.process', data: init.data }] };
 *       if (service) return { complete: { data: { orderId: 'order-123' } } };
 *     }
 *   }
 * });
 *
 * const { broker, resolve } = createSimpleEventBroker([userHandler, orderOrchestrator]);
 * ```
 *
 * @example
 * **Advanced Configuration with Domain Routing:**
 * ```typescript
 * const { broker, resolve } = createSimpleEventBroker(
 *   [orchestrator, paymentHandler, notificationHandler],
 *   {
 *     onError: (error, event) => {
 *       logger.error('Event processing failed', {
 *         error: error.message,
 *         eventType: event.type,
 *         eventId: event.id,
 *         source: event.source,
 *         timestamp: new Date().toISOString()
 *       });
 *       // Could implement retry logic, dead letter queues, etc.
 *     },
 *     onDomainedEvents: ({ events, broker }) => {
 *       // Route payment events to external payment processor
 *       if (events.payment) {
 *         events.payment.forEach(event => paymentGateway.send(event));
 *       }
 *
 *       // Route notification events to messaging service
 *       if (events.notifications) {
 *         events.notifications.forEach(event => messagingService.send(event));
 *       }
 *
 *       // Republish other domain events through the broker
 *       Object.entries(events).forEach(([domain, domainEvents]) => {
 *         if (!['payment', 'notifications'].includes(domain)) {
 *           domainEvents.forEach(event => broker.publish(event));
 *         }
 *       });
 *     }
 *   }
 * );
 * ```
 *
 * @example
 * **Event Resolution for Integration Testing:**
 * ```typescript
 * // Test complete workflow execution
 * const testEvent = createArvoEvent({
 *   type: 'order.create',
 *   source: 'test.client',
 *   to: 'order.orchestrator',
 *   data: { userId: '123', items: ['item1', 'item2'] }
 * });
 *
 * const finalEvent = await resolve(testEvent);
 *
 * if (finalEvent) {
 *   // Verify the complete workflow executed successfully
 *   expect(finalEvent.type).toBe('order.completed');
 *   expect(finalEvent.data.orderId).toBeDefined();
 *   expect(finalEvent.source).toBe('test.client'); // Original source preserved
 * } else {
 *   throw new Error('Order processing workflow failed');
 * }
 * ```
 *
 * @example
 * **Direct Event Publishing:**
 * ```typescript
 * // Publish events directly to the broker for real-time processing
 * await broker.publish(createArvoEvent({
 *   type: 'user.signup',
 *   source: 'web.app',
 *   to: 'user.service',
 *   data: { email: 'user@example.com', name: 'John Doe' }
 * }));
 *
 * // The event will be routed to the user service handler automatically
 * // Any resulting events will propagate through the broker
 * ```
 *
 * @remarks
 * **Event Source Conflict Prevention:**
 * The resolve function validates that the input event's source doesn't conflict
 * with registered handler sources to prevent infinite loops and routing ambiguity.
 *
 * **Sequential Processing Guarantee:**
 * Events are processed sequentially within each topic to maintain ordering
 * guarantees and prevent race conditions in workflow state management.
 *
 * **Integration Testing Benefits:**
 * This pattern enables comprehensive integration testing of event-driven workflows
 * without requiring external message brokers, making test suites faster and
 * more reliable while maintaining production-like behavior patterns.
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
  const resolvedHandlerName = 'broker.arvo.simple.handle';
  let resolvedHandlerNameDuplicated = false;

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
    resolvedHandlerNameDuplicated = broker.topics.includes(resolvedHandlerName);
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

  return {
    broker,
    resolve: async (_event: ArvoEvent): Promise<ArvoEvent | null> => {
      if (broker.topics.includes(_event.source)) {
        throw new Error(
          `The event source cannot be one of the handlers in the broker. Please update the event.source, the given is '${_event.source}'`,
        );
      }
      let resolvedEvent: ArvoEvent | null = null;
      broker.subscribe(_event.source, async (event) => {
        resolvedEvent = event;
      });
      await broker.publish(_event);
      if (resolvedEvent === null) {
        return null;
      }
      return resolvedEvent;
    },
  };
};
