import { trace } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

const pkg = getPackageInfo();

/**
 * A tracer instance for the ArvoEventHandler package.
 */
export const ArvoXStateTracer = trace.getTracer(pkg.name, pkg.version);
