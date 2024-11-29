import {
  ArvoSemanticVersion,
  VersionedArvoContract,
  ArvoOrchestratorContract,
  ArvoOrchestrationSubject,
  createArvoEventFactory,
  ArvoEvent,
  CloudEventExtension,
} from 'arvo-core';
import { z } from 'zod';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { OpenTelemetryConfig } from 'arvo-event-handler';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';

/**
 * Creates a properly structured initialization event for an Arvo orchestrator.
 *
 * This utility ensures proper event structure, subject chaining, and type validation
 * for orchestrator initialization. It's specifically designed for use with the state
 * machine's `emit` and `enqueueArvoEvent` functions.
 *
 * @template TContract - The versioned orchestrator contract type that defines accepted
 *                      event schemas and types. Must extend VersionedArvoContract with
 *                      ArvoOrchestratorContract and ArvoSemanticVersion.
 *
 * @param contract - Versioned contract instance that defines event schemas and types
 * @param param - Configuration object for the initialization event
 *
 * @returns A fully formed ArvoEvent with proper typing, subject chain, and validation
 *
 * Key Features:
 * - Automatically generates proper subject chains
 * - Validates event data against contract schemas
 * - Maintains type safety through generics
 * - Integrates with OpenTelemetry for observability
 *
 * @throws {Error} If event data fails contract validation
 * @throws {Error} If source is invalid or missing
 */
export const createOrchestratorInitEvent = <
  TContract extends VersionedArvoContract<
    ArvoOrchestratorContract,
    ArvoSemanticVersion
  >,
>(
  contract: TContract,
  param: Omit<
    EnqueueArvoEventActionParam<
      z.input<TContract['accepts']['schema']>,
      TContract['accepts']['type'],
      CloudEventExtension
    >,
    'type' | 'subject'
  > & {
    source: string;
  },
  opentelemetry?: Omit<OpenTelemetryConfig, 'inheritFrom'>,
): ArvoEvent<
  z.infer<TContract['accepts']['schema']>,
  CloudEventExtension,
  TContract['accepts']['type']
> => {
  const subject = ArvoOrchestrationSubject.new({
    initiator: param.source,
    orchestator: contract.accepts.type,
    version: contract.version,
  });
  const { __extensions, ...eventData } = param;
  return createArvoEventFactory(contract).accepts(
    {
      ...eventData,
      source: eventData.source,
      subject: subject,
    },
    __extensions,
    {
      tracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer(),
    },
  );
};
