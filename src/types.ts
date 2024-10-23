export type Version = `${number}.${number}.${number}`;

import { Tracer } from '@opentelemetry/api';

/**
 * Configuration options for OpenTelemetry integration in execution context.
 *
 * This type defines how tracing should be configured and inherited within
 * the execution pipeline.
 */
export type ExecutionOpenTelemetryConfiguration = {
  /**
   * Specifies the context from which to inherit OpenTelemetry context.
   * - 'event': Inherits context from the event that triggered the execution
   * - 'execution': Inherits context from the parent execution context
   */
  inheritFrom: 'event' | 'execution';

  /**
   * Optional OpenTelemetry tracer instance to use for creating spans.
   * If not provided, a default tracer may be used depending on the implementation.
   */
  tracer?: Tracer;
};
