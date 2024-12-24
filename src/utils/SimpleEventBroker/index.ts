import { ArvoEvent } from 'arvo-core';
import { EventBusListener, EventBusOptions } from './types';
import { promiseTimeout } from './utils';

/**
 * A simple event broker for handling local event-driven workflows within function scope.
 * Ideal for composing function handlers and coordinating local business logic steps.
 *
 * @description
 * Use SimpleEventBroker when you need:
 * - Local event handling within a function's execution scope
 * - Decoupling steps in a business process
 * - Simple composition of handlers for a workflow
 * - In-memory event management for a single operation
 *
 * Not suitable for:
 * - Long-running processes or persistent event storage
 * - Cross-process or distributed event handling
 * - High-throughput event processing (>1000s events/sec)
 * - Mission critical or fault-tolerant systems
 * - Complex event routing or filtering
 *
 * Typical use cases:
 * - Coordinating steps in a registration process
 * - Managing validation and processing workflows
 * - Decoupling business logic steps
 * - Local event-driven state management
 *
 * @example
 * ```typescript
 * // During a registration flow
 * const broker = new SimpleEventBroker({ ... });
 *
 * broker.subscribe('validation.complete', async (event) => {
 *   // Handle validation results
 * });
 *
 * broker.subscribe('user.created', async (event) => {
 *   // Handle user creation side effects
 * });
 *
 * await broker.publish({
 *   to: 'validation.complete',
 *   payload: userData
 * });
 * ```
 */
export class SimpleEventBroker {
  private readonly subscribers: Map<string, Set<EventBusListener>>;
  private readonly queue: ArvoEvent[];
  readonly events: ArvoEvent[];
  private readonly maxQueueSize: number;
  private readonly onError: (error: Error, event: ArvoEvent) => void;
  private isProcessing: boolean;
  private readonly eventProcessDelay: number = 1;

  constructor(options: EventBusOptions) {
    this.subscribers = new Map();
    this.queue = [];
    this.events = [];
    this.isProcessing = false;
    this.maxQueueSize = options.maxQueueSize;
    this.onError = options.errorHandler;
  }

  /**
   * All event types that have registered listeners.
   */
  public get topics(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Subscribe to a specific event type
   * @param topic - Event type to subscribe to
   * @param handler - Function to handle the event
   * @param assertUnique - Asserts the uniqne-ness of the handler.
   *                       If true, then only one handler per topic
   *                                otherwise, throws error
   * @returns Unsubscribe function
   */
  subscribe(
    topic: string,
    handler: EventBusListener,
    assertUnique: boolean = false,
  ): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }

    if (assertUnique && this.subscribers.get(topic)!.size > 1) {
      throw new Error(`Only one subscriber allowed per topic: ${topic}`);
    }

    const handlers = this.subscribers.get(topic)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(topic);
      }
    };
  }

  /**
   * Publish an event to subscribers
   * @param event - Event to publish
   * @throws Error if queue is full or event has no topic
   */
  async publish(event: ArvoEvent): Promise<void> {
    if (!event.to) {
      throw new Error('Event must have a "to" property');
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Event queue is full (max size: ${this.maxQueueSize})`);
    }

    this.queue.push(event);
    this.events.push(event);

    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Current number of events in queue
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Number of subscribers for a given topic
   */
  getSubscriberCount(topic: string): number {
    return this.subscribers.get(topic)?.size ?? 0;
  }

  /**
   * Processes queued events asynchronously, ensuring sequential execution.
   * Handles error cases and maintains the processing state.
   *
   * @remarks
   * - Only one instance of processQueue runs at a time
   * - Events are processed in FIFO order
   * - Failed event handlers trigger onError callback
   * - All handlers for an event are processed in parallel
   *
   * @throws Propagates any unhandled errors from event processing
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        await promiseTimeout(this.eventProcessDelay);
        const handlers = this.subscribers.get(event.to!);

        if (!handlers?.size) {
          this.onError(
            new Error(`No handlers registered for event type: ${event.to}`),
            event,
          );
          continue;
        }

        const handlerPromises = Array.from(handlers).map((handler) =>
          handler(event, this.publish.bind(this)).catch((error) => {
            if (error instanceof Error) {
              this.onError(error, event);
            } else {
              this.onError(new Error(String(error)), event);
            }
          }),
        );

        await Promise.all(handlerPromises);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
