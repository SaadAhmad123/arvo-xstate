import { trace, context, Context, propagation } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

/**
 * A tracer instance for the ArvoXState package.
 */
export const fetchOpenTelemetryTracer = () => {
  const pkg = getPackageInfo('arvo-xstate');
  return trace.getTracer(pkg.name, pkg.version);
};

// Helper function to extract context from traceparent and tracestate
export const extractContext = (
  traceparent: string,
  tracestate: string | null,
): Context => {
  const extractedContext = propagation.extract(context.active(), {
    traceparent,
    tracestate: tracestate ?? undefined,
  });
  return extractedContext;
};
