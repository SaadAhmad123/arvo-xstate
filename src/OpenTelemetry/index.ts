import { trace } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

/**
 * A tracer instance for the ArvoXState package.
 */
export const fetchOpenTelemetryTracer = () => {
  const pkg = getPackageInfo('arvo-xstate');
  return trace.getTracer(pkg.name, pkg.version);
};