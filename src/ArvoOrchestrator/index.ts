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
  ArvoOrchestratorVersion,
  createArvoEvent,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  OpenInferenceSpanKind,
} from 'arvo-core';
import { Actor, AnyActorLogic, createActor, Snapshot } from 'xstate';
import ArvoMachine from '../ArvoMachine';
import { createOtelSpan } from 'arvo-event-handler';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  base64ToObject,
  findLatestVersion,
  isSemanticVersion,
  objectToBase64,
} from './utils';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { XStatePersistanceSchema } from './schema';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';
import { Version } from '../types';

/**
 * ArvoOrchestrator manages the execution of ArvoMachines and handles orchestration events.
 * It provides a framework for managing complex workflows and state machines in a distributed system.
 *
 * @template TUri - The URI type for the orchestrator, uniquely identifying it in the system.
 * @template TInitType - The initialization event type for the orchestrator.
 * @template TInit - Zod schema for validating initialization data.
 * @template TCompleteType - The completion event type for the orchestrator.
 * @template TComplete - Zod schema for validating completion data.
 * @template TServiceContracts - Record of ArvoContracts for services this orchestrator interacts with.
 * @template TLogic - The type of XState actor logic used in the orchestrator.
 */
export default class ArvoOrchestrator<
  TUri extends string = string,
  TInitType extends string = string,
  TInit extends z.ZodTypeAny = z.ZodTypeAny,
  TCompleteType extends string = string,
  TComplete extends z.ZodTypeAny = z.ZodTypeAny,
  TServiceContracts extends Record<string, ArvoContract> = Record<
    string,
    ArvoContract
  >,
  TLogic extends AnyActorLogic = AnyActorLogic,
> {
  /** The source identifier for the orchestrator */
  public readonly source: TInitType;

  /** The number of execution units for the orchestrator */
  public readonly executionunits: number;

  /**
   * The array of ArvoMachines managed by this orchestrator.
   * Each machine represents a different version of the orchestrator's logic.
   */
  public readonly machines: ArvoMachine<
    string,
    ArvoOrchestratorVersion,
    ArvoOrchestratorContract<TUri, TInitType, TInit, TCompleteType, TComplete>,
    TServiceContracts,
    TLogic
  >[];

  /**
   * Constructs a new ArvoOrchestrator instance.
   *
   * @param param - The configuration parameters for the orchestrator
   * @throws Error if no machines are provided or if machines have inconsistent self contracts
   */
  constructor(
    param: IArvoOrchestrator<
      TUri,
      TInitType,
      TInit,
      TCompleteType,
      TComplete,
      TServiceContracts,
      TLogic
    >,
  ) {
    if (param.machines.length === 0) {
      throw new Error(
        'ArvoOrchestrator initialization failed: No machines provided. At least one machine must be defined for the Arvo orchestrator.',
      );
    }

    this.machines = param.machines;
    this.executionunits = param.executionunits;
    this.source = param.machines[0].contracts.self.init.type;
    const representativeMachine = this.machines[0];
    const representativeMachineSelfContractJson: string = JSON.stringify(
      representativeMachine.contracts.self.toJsonSchema(),
    );
    for (const item of this.machines) {
      if (
        JSON.stringify(item.contracts.self.toJsonSchema()) !==
        representativeMachineSelfContractJson
      ) {
        throw new Error(
          'ArvoOrchestrator initialization failed: Inconsistent self contracts detected. All machines must have the same self contract for a particular orchestrator.',
        );
      }
      if (!isSemanticVersion(item.version)) {
        throw new Error(
          `The machine=${item.id} version must be a semantic version like 0.0.1. The provided is ${item.version}`,
        );
      }
      if (item.version === ArvoOrchestrationSubject.WildCardMachineVersion) {
        throw new Error(
          `The machine=${item.id} version cannot be ${item.version} as this is supposed to be a wild card version`,
        );
      }
    }
  }

  /**
   * Executes the orchestrator based on the given event, state, and parent subject.
   * This method is the core of the orchestrator, handling state transitions and event emissions.
   *
   * Execution process:
   * 1. Sets up OpenTelemetry tracing based on the provided configuration.
   * 2. Validates the incoming event against the orchestrator's configuration.
   * 3. Selects the appropriate machine based on the event's version.
   * 4. Creates or resumes an actor (state machine instance) based on the presence of existing state.
   * 5. Processes the event through the actor, triggering state transitions.
   * 6. Collects and validates events emitted by the actor during processing.
   * 7. Handles any output or error in the final snapshot.
   * 8. Persists the final state of the actor after processing.
   * 9. Returns the execution results, including new state, emitted events, and subject information.
   *
   * @param input - Execution input
   * @param input.event - Event triggering this execution, must be directed to this orchestrator
   * @param input.state - Current state of the orchestrator, if any. If not provided, a new orchestration is initiated
   * @param input.parentSubject - Subject of the parent orchestration or process. If null, this is treated as a root orchestration
   * @param input.opentelemetry - Configuration for OpenTelemetry tracing. Defaults to inheriting from the execution environment
   * @param input.opentelemetry.inheritFrom - Specifies whether to inherit the span context from 'event' or 'execution'. Default is 'event'
   *
   * @returns Execution output
   * @returns output.state - New state of the orchestrator, compressed and encoded as a string
   * @returns output.events - Array of events emitted during the execution
   * @returns output.executionStatus - Status of the execution ('success' or 'error')
   * @returns output.snapshot - Raw snapshot of the actor's state after execution
   * @returns output.subject - Subject of the current orchestration execution
   * @returns output.parentSubject - Subject of the parent orchestration or process (null for root orchestrations)
   *
   * @throws Error for invalid events (wrong destination or unsupported version)
   * @throws Error for initialization with an incorrect event type
   * @throws Error if an emitted event doesn't match its contract (in strict mode)
   *
   * @remarks
   * - Uses OpenTelemetry for tracing and error reporting. The tracing behavior can be configured
   *   using the `opentelemetry` parameter.
   * - Handles both 'emit' (strict) and 'enqueueArvoEvent' (non-strict) event emissions.
   * - Processes volatile context (e.g., temporary event queue) before persisting state.
   * - If the final snapshot contains an output, creates and enqueues a completion event.
   * - If the final snapshot contains an error, throws that error to trigger error handling.
   * - In case of errors, generates and returns a system error event instead of the normal output.
   * - OpenTelemetry attributes are set on the span for both processed and emitted events,
   *   providing detailed tracing information throughout the execution process.
   * - The `parentSubject` parameter is crucial for maintaining the orchestration hierarchy:
   *   - For root orchestrations (null parentSubject), the original subject is preserved.
   *   - For child orchestrations, error and completion events are routed back to the parent process.
   * - The execution ensures proper event routing based on the orchestration hierarchy:
   *   - Completion events for child orchestrations are sent to the parent subject.
   *   - System error events are always sent to the original initiator of the orchestration.
   *
   * @warning Potential Stray Events
   * Developers should be aware of potential stray events that may be created during execution:
   *
   * 1. Orphaned Events: If the `to` field is not explicitly set in emitted events, the event type
   *    is used as the default destination. This may lead to events being sent to unintended recipients
   *    if the type doesn't correspond to a valid destination.
   *
   * 2. Misrouted Completion Events: For child orchestrations, completion events are sent to the
   *    parent subject. If the parent subject is not properly maintained or becomes invalid, these
   *    events may be misrouted or lost.
   *
   * 3. Unhandled Error Events: While system error events are always sent to the original initiator,
   *    other error events emitted during execution may not follow the same routing rules and could
   *    potentially be sent to unexpected destinations.
   *
   * 4. Events with Invalid Contracts: When using non-strict event emission (via 'enqueueArvoEvent'),
   *    events may be created that do not conform to any known contract. These events might be
   *    difficult to handle or interpret by receiving systems.
   *
   * 5. Duplicate Events: In complex orchestrations, especially those with loops or recursive
   *    structures, there's a risk of creating duplicate events. This can lead to unnecessary
   *    processing or confusion in event handling systems.
   *
   * To mitigate these issues, ensure proper error handling, validate event destinations, and
   * carefully manage the orchestration hierarchy and subject routing throughout the execution process.
   *
   * @remarks
   * Version Selection:
   * If the subject contains the wildcard version (0.0.0), the orchestrator automatically
   * selects the latest available version from its machines. This allows for automatic version
   * resolution without explicitly specifying a particular version number.
   */
  public execute({
    event,
    state,
    parentSubject,
    opentelemetry,
  }: ArvoOrchestratorExecuteInput): ArvoOrchestratorExecuteOutput {
    const span = createOtelSpan({
      spanName: `ArvoOrchestrator<${this.machines[0].contracts.self.uri}>.execute<${event.type}>`,
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
    return context.with(
      trace.setSpan(context.active(), span),
      (): ArvoOrchestratorExecuteOutput => {
        Object.entries(event.otelAttributes).forEach(([key, value]) =>
          span.setAttribute(`to_process.0.${key}`, value),
        );
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        const eventQueue: ArvoEvent[] = [];
        let orchestrationInitSource: string = event.source;
        try {
          if (event.to !== this.source) {
            throw new Error(
              `Invalid event destination: The event's 'to' field (${event.to}) does not match the orchestrator's source (${this.source}). Please ensure the event is directed to the correct orchestrator.`,
            );
          }
          const parsedSubject = ArvoOrchestrationSubject.parse(event.subject);
          orchestrationInitSource = parsedSubject.execution.initiator;
          if (parsedSubject.orchestrator.name !== this.source) {
            throw new Error(
              `Invalid event subject: The orchestrator name in the parsed subject (${parsedSubject.orchestrator.name}) does not match the expected source (${this.source}). Please verify the event originator's configuration.`,
            );
          }

          let versionToUse = parsedSubject.orchestrator.version;
          if (
            versionToUse === ArvoOrchestrationSubject.WildCardMachineVersion
          ) {
            versionToUse = findLatestVersion(
              this.machines.map((item) => item.version),
            );
          }
          const machine = this.machines.filter(
            (item) => item.version === versionToUse,
          )[0];
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
            const { __extensions, data, ...eventData } = emittedEvent;
            const eventContract: ArvoContract | undefined = Object.values(
              machine.contracts.services,
            ).filter((item) => item.accepts.type === eventData.type)[0];
            let verifiedData = data;
            if (strict) {
              if (!eventContract) {
                throw new Error(
                  `The emitted event (type=${emittedEvent.type}) does not correspond to a contract. If this is delibrate, the use the action 'enqueueArvoEvent' instead of the 'emit'`,
                );
              }
              verifiedData = eventContract.accepts.schema.parse(verifiedData);
            }
            const arvoEvent = createArvoEvent(
              {
                ...eventData,
                data: verifiedData,
                dataschema: eventContract?.uri ?? undefined,
                traceparent: otelSpanHeaders.traceparent ?? undefined,
                tracestate: otelSpanHeaders.tracestate ?? undefined,
                source: this.source,
                subject: emittedEvent.subject ?? event.subject,
                // It must be explicitly mentioned in the execute tsdocs that the if the
                // machine logic does not emit the 'to' field then the 'type' is used by
                // default
                to: eventData.to ?? eventData.type,
                redirectto: eventData.redirectto ?? undefined,
                executionunits: eventData.executionunits ?? this.executionunits,
                accesscontrol:
                  eventData.accesscontrol ?? event.accesscontrol ?? undefined,
              },
              __extensions,
            );
            eventQueue.push(arvoEvent);
          };

          let actor: Actor<typeof machine.logic>;
          if (!state) {
            if (event.type !== this.source) {
              throw new Error(
                `Invalid initialization event: Expected event type '${this.source}' for a new orchestration, but received '${event.type}'. Please provide the correct event type to initiate the orchestration.`,
              );
            }

            this.machines[0].contracts.self.init.schema.parse(event.data);
            actor = createActor(machine.logic, {
              input: event.toJSON() as any,
            });
            actor.on('*', (event: EnqueueArvoEventActionParam) =>
              enqueueEvent(event, true),
            );
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
            actor.on('*', (event: EnqueueArvoEventActionParam) =>
              enqueueEvent(event, true),
            );
            actor.send(event.toJSON() as any);
          }

          const snapshot: Snapshot<
            z.infer<typeof machine.contracts.self.complete.schema>
          > = actor.getPersistedSnapshot();
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
                type: machine.contracts.self.complete.type,
                data: machine.contracts.self.complete.schema.parse(
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
          const result = createArvoEventFactory(
            this.machines[0].contracts.self,
          ).systemError({
            source: this.source,
            subject: parentSubject ?? event.subject,
            // The system error must always go back to
            // the source with initiated it
            to: orchestrationInitSource,
            error: error as Error,
            executionunits: this.executionunits,
            traceparent: otelSpanHeaders.traceparent ?? undefined,
            tracestate: otelSpanHeaders.tracestate ?? undefined,
            accesscontrol: event.accesscontrol ?? undefined,
          });
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
    return this.machines[0].contracts.self.systemError;
  }
}
