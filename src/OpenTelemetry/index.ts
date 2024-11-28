import { trace } from '@opentelemetry/api';

/**
 * A tracer instance for the ArvoXState package.
 */
export const fetchOpenTelemetryTracer = () => {
  return trace.getTracer('arvo-instrumentation');
};
