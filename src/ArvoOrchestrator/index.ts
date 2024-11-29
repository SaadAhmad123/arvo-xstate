import { z } from 'zod';
import {
  ArvoOrchestratorExecuteInput,
  ArvoOrchestratorExecuteOutput,
  IArvoOrchestrator,
} from './types';
import {
  ArvoContract,
  ArvoContractRecord,
  ArvoEvent,
  ArvoExecutionSpanKind,
  ArvoOrchestrationSubject,
  ArvoOrchestratorContract,
  ArvoSemanticVersion,
  createArvoEvent,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  OpenInferenceSpanKind,
  OpenTelemetryHeaders,
  VersionedArvoContract,
} from 'arvo-core';
import { Actor, AnyActorLogic, createActor, Snapshot } from 'xstate';
import ArvoMachine from '../ArvoMachine';
import { createOtelSpan } from 'arvo-event-handler';
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  Tracer,
} from '@opentelemetry/api';
import { base64ToObject, findLatestVersion, objectToBase64 } from './utils';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { XStatePersistanceSchema } from './schema';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';

/**
 * Enqueues an event to be emitted by the orchestrator.
 *
 * @param emittedEvent - The event to be enqueued
 * @param strict - If true, performs strict validation against the event contract
 * @throws Error if strict validation fails or if the event type doesn't correspond to a contract
 */
const createEnqueuableEvent = (
  machineServiceContracts: Record<
    string,
    VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
  >,
  otelSpanHeaders: OpenTelemetryHeaders,
  orchestrator: ArvoOrchestrator<ArvoOrchestratorContract>,
  ogEvent: ArvoEvent,
  otelTracer: Tracer,
  emittedEvent: EnqueueArvoEventActionParam,
  strict: boolean,
) => {
  const { __extensions, data, ...eventData } = emittedEvent;
  const eventContract:
    | VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
    | undefined = Object.values(machineServiceContracts).filter(
    (item) => item.accepts.type === eventData.type,
  )[0];
  let verifiedData = data;
  let dataschema: string | undefined = emittedEvent.dataschema;
  if (strict) {
    if (!eventContract) {
      throw new Error(
        `The emitted event (type=${emittedEvent.type}) does not correspond to a contract. If this is delibrate, the use the action 'enqueueArvoEvent' instead of the 'emit'`,
      );
    }
    if (
      dataschema &&
      dataschema !== `${eventContract.uri}/${eventContract.version}`
    ) {
      throw new Error(
        `The dataschema of the event to be emitted (dataschema=${dataschema}) does not match the dataschema imposed by the contract (uri=${eventContract.uri}, version=${eventContract.version})`,
      );
    }
    verifiedData = eventContract.accepts.schema.parse(verifiedData);
  }

  if (emittedEvent?.dataschema) {
    dataschema = emittedEvent.dataschema;
  } else if (eventContract?.uri && eventContract?.version) {
    dataschema = `${eventContract.uri}/${eventContract.version}`;
  }

  return createArvoEvent(
    {
      ...eventData,
      data: verifiedData,
      dataschema: dataschema,
      traceparent: otelSpanHeaders.traceparent ?? undefined,
      tracestate: otelSpanHeaders.tracestate ?? undefined,
      source: orchestrator.source,
      subject: emittedEvent.subject ?? ogEvent.subject,
      to: eventData.to ?? eventData.type,
      redirectto: eventData.redirectto ?? undefined,
      executionunits: eventData.executionunits ?? orchestrator.executionunits,
      accesscontrol:
        eventData.accesscontrol ?? ogEvent.accesscontrol ?? undefined,
    },
    __extensions,
    {
      disable: false,
      tracer: otelTracer,
    },
  );
};

/**
 * ArvoOrchestrator is a sophisticated state machine orchestration system that manages
 * versioned workflow execution in distributed environments. It coordinates multiple
 * ArvoMachines, handles event routing, and maintains state across executions.
 *
 * @template TSelfContract - The contract type that defines the orchestrator's capabilities,
 *                          event schemas, and version specifications. Must extend ArvoOrchestratorContract.
 *
 * @example
 * ```typescript
 * const orchestrator = createArvoOrchestrator({
 *   contract: myContract,
 *   executionunits: 0.1,
 *   machines: {
 *     '1.0.0': machineV1,
 *     '2.0.0': machineV2
 *   }
 * });
 * ```
 */
export default class ArvoOrchestrator<
  TSelfContract extends ArvoOrchestratorContract,
> {
  /** Contract defining the orchestrator's capabilities and supported versions */
  public readonly contract: TSelfContract;

  /**
   * Unique identifier for this orchestrator instance, derived from the contract type
   * Used for event routing and orchestration identification
   */
  public readonly source: TSelfContract['type'];

  /**
   * Resource limit for execution cycles
   * Prevents infinite loops and ensures resource constraints are respected
   */
  public readonly executionunits: number;

  /**
   * Version-keyed collection of state machines implementing the orchestrator's logic
   * Each version represents a different implementation of the contract specifications
   */
  public readonly machines: {
    [V in keyof TSelfContract['versions'] & ArvoSemanticVersion]: ArvoMachine<
      string,
      V,
      VersionedArvoContract<TSelfContract, V>,
      Record<string, VersionedArvoContract<ArvoContract, ArvoSemanticVersion>>,
      AnyActorLogic
    >;
  };

  constructor(param: IArvoOrchestrator<TSelfContract>) {
    this.contract = param.contract;
    this.source = this.contract.type;
    this.machines = param.machines;
    this.executionunits = param.executionunits;
    for (const item of Object.keys(
      this.contract.versions,
    ) as ArvoSemanticVersion[]) {
      if (!this.machines[item]) {
        throw new Error(
          `The contract (uri=${this.contract.uri}) requires the machine of version '${item}' to be implemented`,
        );
      }
      if (this.source !== this.machines[item].contracts.self.accepts.type) {
        throw new Error(
          'ArvoOrchestrator initialization failed: Inconsistent self contracts detected. All machines must have the same self contract for a particular orchestrator.',
        );
      }
    }
  }

  /**
   * Executes the orchestrator based on the given event, state, and parent subject.
   * This method is the core of the orchestrator, handling state transitions and event emissions.
   *
   * @param input - Execution input parameters
   * @param input.event - Event triggering this execution
   * @param input.state - Current state (null for new orchestration)
   * @param input.parentSubject - Parent orchestration ID (null for root orchestration)
   * @param input.opentelemetry - OpenTelemetry configuration (defaults to environment)
   *
   * @returns {ArvoOrchestratorExecuteOutput} Execution results
   * @throws {Error} For invalid events, versions, or contract violations
   *
   * ## Execution process:
   * 1. Sets up OpenTelemetry tracing based on the provided configuration.
   * 2. Validates the incoming event against the orchestrator's configuration.
   * 3. Selects the appropriate machine based on the event's version.
   * 4. Creates or resumes an actor (state machine instance) based on existing state.
   * 5. Processes the event through the actor, triggering state transitions.
   * 6. Collects and validates events emitted by the actor during processing.
   * 7. Handles any output or error in the final snapshot.
   * 8. Persists the final state of the actor after processing.
   * 9. Returns the execution results, including new state, emitted events, and subject information.
   *
   * ## Remarks:
   * - Uses OpenTelemetry for tracing and error reporting
   * - Handles both strict and non-strict event emissions
   * - Manages volatile context before state persistence
   * - Routes completion events to parent orchestrations
   * - Routes system errors to original initiator
   * - Supports automatic version selection with wildcard (0.0.0)
   *
   * ## Potential Issues:
   * 1. Orphaned Events: Default routing uses event type if 'to' is unset
   * 2. Misrouted Events: Verify parent subject validity for completion events
   * 3. Error Events: Custom errors may need explicit routing rules
   * 4. Contract Validation: Non-strict events may lack proper contracts
   * 5. Event Duplication: Watch for loops in complex orchestrations
   *
   * ###  To mitigate:
   * - Validate event destinations
   * - Maintain clear orchestration hierarchy
   * - Implement proper error handling
   * - Monitor for routing issues
   */
  public execute({
    event,
    state,
    parentSubject,
    opentelemetry,
  }: ArvoOrchestratorExecuteInput): ArvoOrchestratorExecuteOutput {
    const span = createOtelSpan({
      spanName: `ArvoOrchestrator<${this.contract.uri}>.execute<${event.type}>`,
      spanKinds: {
        kind: SpanKind.INTERNAL,
        openInference: OpenInferenceSpanKind.CHAIN,
        arvoExecution: ArvoExecutionSpanKind.COMMANDER,
      },
      event: event,
      opentelemetryConfig: opentelemetry ?? {
        inheritFrom: 'event',
        tracer: fetchOpenTelemetryTracer(),
      },
    });

    const createErrorEvent = (
      error: Error,
      otelSpanHeaders: OpenTelemetryHeaders,
    ) =>
      createArvoEventFactory(this.contract.version('any')).systemError({
        source: this.source,
        subject: parentSubject ?? event.subject,
        // The system error must always go back to
        // the source with initiated it
        to: event.source,
        error: error as Error,
        executionunits: this.executionunits,
        traceparent: otelSpanHeaders.traceparent ?? undefined,
        tracestate: otelSpanHeaders.tracestate ?? undefined,
        accesscontrol: event.accesscontrol ?? undefined,
      });

    return context.with(
      trace.setSpan(context.active(), span),
      (): ArvoOrchestratorExecuteOutput => {
        Object.entries(event.otelAttributes).forEach(([key, value]) =>
          span.setAttribute(`to_process.0.${key}`, value),
        );
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        const eventQueue: ArvoEvent[] = [];
        const errorQueue: ArvoEvent[] = [];
        try {
          if (event.to !== this.source) {
            throw new Error(
              `Invalid event destination: The event's 'to' field (${event.to}) does not match the orchestrator's source (${this.source}). Please ensure the event is directed to the correct orchestrator.`,
            );
          }
          const parsedSubject = ArvoOrchestrationSubject.parse(event.subject);
          if (parsedSubject.orchestrator.name !== this.source) {
            throw new Error(
              `Invalid event subject: The orchestrator name in the parsed subject (${parsedSubject.orchestrator.name}) does not match the expected source (${this.source}). Please verify the event originator's configuration.`,
            );
          }

          let versionToUse: ArvoSemanticVersion =
            parsedSubject.orchestrator.version;
          if (
            versionToUse === ArvoOrchestrationSubject.WildCardMachineVersion
          ) {
            versionToUse = findLatestVersion(
              Object.values(this.machines).map((item) => item.version),
            );
          }
          const machine = this.machines[versionToUse];
          if (!machine) {
            throw new Error(
              `Unsupported version: No machine found for orchestrator ${this.source} with version '${parsedSubject.orchestrator.version}'. Please check the supported versions and update your request.`,
            );
          }

          /**
           * Enqueues an event to be emitted by the orchestrator.
           *
           * @param emittedEvent - The event to be enqueued
           * @param strict - If true, performs strict validation against the event contract
           * @throws Error if strict validation fails or if the event type doesn't correspond to a contract
           */
          const enqueueEvent = (
            emittedEvent: EnqueueArvoEventActionParam,
            strict: boolean = true,
          ) => {
            try {
              eventQueue.push(
                createEnqueuableEvent(
                  machine.contracts.services,
                  otelSpanHeaders,
                  this,
                  event,
                  opentelemetry?.tracer ?? fetchOpenTelemetryTracer(),
                  emittedEvent,
                  strict,
                ),
              );
            } catch (e) {
              errorQueue.push(createErrorEvent(e as Error, otelSpanHeaders));
            }
          };

          let actor: Actor<typeof machine.logic>;
          if (!state) {
            if (event.type !== this.source) {
              throw new Error(
                `Invalid initialization event: Expected event type '${this.source}' for a new orchestration, but received '${event.type}'. Please provide the correct event type to initiate the orchestration.`,
              );
            }
            this.contract
              .version(versionToUse)
              .accepts.schema.parse(event.data);
            actor = createActor(machine.logic, {
              input: event.toJSON() as any,
            });
            actor.on('*', (event: EnqueueArvoEventActionParam) => {
              enqueueEvent(event, true);
            });
            // With this the errors are not leaked anymore
            actor.subscribe({ error: () => {} });
            actor.start();
          } else {
            const existingSnapshot = base64ToObject(
              XStatePersistanceSchema,
              state,
            );
            actor = createActor(machine.logic, {
              snapshot: existingSnapshot,
            } as any);
            actor.start();
            actor.on('*', (event: EnqueueArvoEventActionParam) => {
              enqueueEvent(event, true);
            });
            // With this the errors are not leaked anymore
            actor.subscribe({ error: () => {} });
            actor.send(event.toJSON() as any);
          }

          const snapshot: Snapshot<any> = actor.getPersistedSnapshot();
          if ((snapshot as any)?.context?.arvo$$?.volatile$$) {
            (
              (snapshot as any)?.context?.arvo$$?.volatile$$
                ?.eventQueue$$ as EnqueueArvoEventActionParam[]
            ).forEach((item) => enqueueEvent(item, false));
            delete (snapshot as any).context.arvo$$.volatile$$;
          }

          if (snapshot.output) {
            enqueueEvent(
              {
                subject: parentSubject ?? undefined,
                type: Object.keys(machine.contracts.self.emits)[0],
                dataschema: `${machine.contracts.self.uri}/${machine.contracts.self.version}`,
                data: Object.values(machine.contracts.self.emits)[0].parse(
                  snapshot.output,
                ),
                to: parsedSubject.execution.initiator,
              },
              false,
            );
          }

          if (snapshot.error) {
            throw snapshot.error;
          }

          const compressedSnapshot = objectToBase64(
            XStatePersistanceSchema,
            snapshot as any,
          );

          if (errorQueue.length) {
            errorQueue.forEach((result, index) => {
              Object.entries(result.otelAttributes).forEach(([key, value]) =>
                span.setAttribute(`to_emit.${index}.${key}`, value),
              );
            });
            span.setStatus({ code: SpanStatusCode.ERROR });
            return {
              executionStatus: 'error',
              events: errorQueue,
              state: state,
              snapshot: null,
              subject: event.subject,
              parentSubject: parentSubject,
            };
          }

          eventQueue.forEach((result, index) => {
            Object.entries(result.otelAttributes).forEach(([key, value]) =>
              span.setAttribute(`to_emit.${index}.${key}`, value),
            );
          });
          return {
            state: compressedSnapshot,
            events: eventQueue,
            executionStatus: 'success',
            snapshot: snapshot as z.infer<typeof XStatePersistanceSchema>,
            subject: event.subject,
            parentSubject: parentSubject,
          };
        } catch (error) {
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          const result = createErrorEvent(error as Error, otelSpanHeaders);
          Object.entries(result.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_emit.0.${key}`, value),
          );
          return {
            executionStatus: 'error',
            events: [result],
            state: state,
            snapshot: null,
            subject: event.subject,
            parentSubject: parentSubject,
          };
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Gets the system error schema for the orchestrator.
   * This schema defines the structure of system error events that can be emitted by the orchestrator.
   *
   * @returns The ArvoContractRecord for system errors
   */
  public get systemErrorSchema(): ArvoContractRecord {
    return this.contract.version('any').systemError;
  }
}
