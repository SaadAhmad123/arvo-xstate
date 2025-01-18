import type { ArvoEvent } from 'arvo-core';

/*
 * Function type for event handlers in the EventBus system.
 * @param event - The event being handled
 * @param publish - Function to publish new events from within the handler
 */
export type EventBusListener = (event: ArvoEvent, publish: (event: ArvoEvent) => Promise<void>) => Promise<void>;

/*
 * Configuration options for the EventBus instance
 */
export interface EventBusOptions {
  /*
   * Maximum number of events that can be queued at once
   */
  maxQueueSize: number;
  /*
   * Custom error handler function for processing failures
   * @param error - The error that occurred
   * @param event - The event that caused the error
   */
  errorHandler: (error: Error, event: ArvoEvent) => void;
}
