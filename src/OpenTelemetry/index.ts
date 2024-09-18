import { trace, propagation, Context, context } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

const pkg = getPackageInfo();

/**
 * A tracer instance for the ArvoEventHandler package.
 */
export const ArvoStateEngineTracer = trace.getTracer(pkg.name, pkg.version);
