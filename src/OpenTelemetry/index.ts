import { trace, context, Context, propagation } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

const pkg = getPackageInfo();

/**
 * A tracer instance for the ArvoEventHandler package.
 */
export const ArvoXStateTracer = trace.getTracer(pkg.name, pkg.version);

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
