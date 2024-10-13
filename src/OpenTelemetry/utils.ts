import { Span, SpanKind, SpanOptions } from '@opentelemetry/api';
import {
  ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  OpenInference,
  OpenInferenceSpanKind,
} from 'arvo-core';
import * as fs from 'fs';
import * as path from 'path';
import { ArvoXStateTracer, extractContext } from '.';

/**
 * Represents the structure of a package.json file.
 *
 * This interface defines the minimum required fields (name and version)
 * and allows for additional fields using an index signature.
 *
 * @example
 * const packageJson: PackageJson = {
 *   name: "my-package",
 *   version: "1.0.0",
 *   description: "An example package",
 *   author: "John Doe"
 * };
 */
interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

/**
 * Retrieves the name and version from the package.json file.
 *
 * This function attempts to read and parse the package.json file located two
 * directories above the current file. It's useful for dynamically obtaining
 * the package information at runtime.
 *
 * @returns An object containing the name and version of the package.
 * @throws Will not throw, but logs an error if the file cannot be read or parsed.
 *
 * @example
 * const { name, version } = getPackageInfo();
 * console.log(`Package: ${name}, Version: ${version}`);
 */
export function getPackageInfo(): { name: string; version: string } {
  try {
    // Read the package.json file
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    // Parse the JSON content
    const packageJson: PackageJson = JSON.parse(packageJsonContent);
    // Extract name and version
    const { name, version } = packageJson;
    return { name, version };
  } catch (error) {
    console.error('Error reading package.json:', error);
    return { name: 'Unknown', version: 'Unknown' };
  }
}

/**
 * Creates a span from an ArvoEvent.
 *
 * This function is crucial for distributed tracing in the Arvo system. It creates
 * a new span, which represents a unit of work or operation in the tracing system.
 * The function can either create a new root span or continue an existing trace
 * based on the presence of traceparent in the event.
 *
 * @param spanName - The name of the span to be created. This should be descriptive
 *                   of the operation being traced.
 * @param event - The ArvoEvent from which to create the span. This event may contain
 *                tracing information to link this span to an existing trace.
 * @param spanKinds - An object containing the span kinds for different contexts.
 *                    This allows the span to be properly categorized in different
 *                    tracing systems.
 * @param spanKinds.kind - The OpenTelemetry SpanKind, indicating the relationship
 *                         between the span, its parents, and its children.
 * @param spanKinds.openInference - The OpenInference span kind, used for categorizing
 *                                  the span in the OpenInference system.
 * @param spanKinds.arvoExecution - The ArvoExecution span kind, used for categorizing
 *                                  the span in the Arvo execution context.
 * @returns A new Span object that can be used to record the details of the operation.
 *
 * @example
 * const event: ArvoEvent = createArvoEvent({
 *   ...
 *   traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
 *   tracestate: "rojo=00f067aa0ba902b7"
 * });
 * const span = createSpanFromEvent("processOrder", event, {
 *   kind: SpanKind.INTERNAL,
 *   openInference: OpenInferenceSpanKind.LLMCHAIN,
 *   arvoExecution: ArvoExecutionSpanKind.TASK
 * });
 * // Use the span...
 * span.end();
 */
export const createSpanFromEvent = (
  spanName: string,
  event: ArvoEvent,
  spanKinds: {
    kind: SpanKind;
    openInference: OpenInferenceSpanKind;
    arvoExecution: ArvoExecutionSpanKind;
  },
): Span => {
  const spanOptions: SpanOptions = {
    kind: spanKinds.kind,
    attributes: {
      [OpenInference.ATTR_SPAN_KIND]: spanKinds.openInference,
      [ArvoExecution.ATTR_SPAN_KIND]: spanKinds.arvoExecution,
    },
  };

  let span: Span;
  if (event.traceparent) {
    // If traceparent exists, we're continuing an existing trace
    const inheritedContext = extractContext(
      event.traceparent,
      event.tracestate,
    );
    span = ArvoXStateTracer.startSpan(spanName, spanOptions, inheritedContext);
  } else {
    // If no traceparent, start a new root span
    span = ArvoXStateTracer.startSpan(spanName, spanOptions);
  }

  return span;
};
