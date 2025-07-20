import { context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  ArvoOrchestrationSubject,
  type ArvoOrchestrationSubjectContent,
  createArvoOrchestratorEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  logToSpan,
  OpenInference,
  OpenInferenceSpanKind,
  type ViolationError,
  type ArvoEvent,
  type ArvoOrchestratorContract,
  type VersionedArvoContract,
  EventDataschemaUtil,
  isWildCardArvoSematicVersion,
  type OpenTelemetryHeaders,
  type ArvoSemanticVersion,
  type ArvoContract,
  createArvoEvent,
  type InferArvoEvent,
} from 'arvo-core';
import {
  AbstractArvoEventHandler,
  ConfigViolation,
  ContractViolation,
  ExecutionViolation,
  type ArvoEventHandlerOpenTelemetryOptions,
} from 'arvo-event-handler';
import type { z } from 'zod';
import type { ArvoResumableHandler, ArvoResumableState } from './types';
import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrator/error';
import type { IMachineMemory } from '../MachineMemory/interface';
import { SyncEventResource } from '../SyncEventResource/index';
import type { AcquiredLockStatusType } from '../SyncEventResource/types';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { isError } from '../utils/index';

/**
 * ArvoResumable - A stateful orchestration handler for managing distributed workflows
 *
 * ArvoResumable provides a handler-based approach to workflow orchestration that prioritizes
 * explicit control and simplicity over declarative abstractions. It excels at straightforward
 * request-response patterns and linear workflows while maintaining full type safety and
 * contract validation throughout the execution lifecycle.
 *
 * This class addresses fundamental issues in event-driven architecture including:
 * - Contract management with runtime validation and type safety
 * - Graduated complexity allowing simple workflows to remain simple
 * - Unified event handling across initialization and service responses
 * - Explicit state management without hidden abstractions
 *
 * Key capabilities:
 * - Handler-based workflow orchestration with explicit state control
 * - Contract-driven event validation with runtime schema enforcement
 * - Distributed resource locking for transaction safety
 * - Comprehensive OpenTelemetry integration for observability
 * - Automatic error handling with system error event generation
 * - Support for orchestrator chaining and nested workflow patterns
 * - Domain-based event routing and organization
 *
 * Unlike state machine approaches, ArvoResumable uses imperative handler functions
 * that provide direct control over workflow logic. This makes debugging easier and
 * reduces the learning curve for teams familiar with traditional programming patterns.
 *
 * @see {@link createArvoResumable} Factory function for creating instances
 * @see {@link ArvoResumableHandler} Handler interface documentation
 * @see {@link ArvoResumableState} State structure documentation
 */
export class ArvoResumable<
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
> extends AbstractArvoEventHandler {
  readonly executionunits: number;
  readonly syncEventResource: SyncEventResource<ArvoResumableState<TMemory>>;
  readonly source: string;
  readonly handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;

  readonly contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };

  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  get memory(): IMachineMemory<ArvoResumableState<TMemory>> {
    return this.syncEventResource.memory;
  }

  constructor(param: {
    contracts: {
      self: TSelfContract;
      services: TServiceContract;
    };
    executionunits: number;
    memory: IMachineMemory<ArvoResumableState<TMemory>>;
    requiresResourceLocking?: boolean;
    handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
  }) {
    super();
    this.executionunits = param.executionunits;
    this.source = param.contracts.self.type;
    this.syncEventResource = new SyncEventResource(param.memory, param.requiresResourceLocking ?? true);
    this.contracts = param.contracts;
    this.handler = param.handler;
  }

  protected validateInput(event: ArvoEvent): {
    contractType: 'self' | 'service';
  } {
    let resolvedContract: VersionedArvoContract<any, any> | null = null;
    let contractType: 'self' | 'service';

    const parsedEventDataSchema = EventDataschemaUtil.parse(event);
    if (!parsedEventDataSchema) {
      throw new ExecutionViolation(
        `Event dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}'). This makes the event opaque and does not allow contract resolution`,
      );
    }

    if (event.type === this.contracts.self.type) {
      contractType = 'self';
      resolvedContract = this.contracts.self.version(parsedEventDataSchema.version);
    } else {
      contractType = 'service';
      for (const contract of Object.values(this.contracts.services)) {
        if (resolvedContract) break;
        for (const emitType of [...contract.emitList, contract.systemError]) {
          if (resolvedContract) break;
          if (event.type === emitType.type) {
            resolvedContract = contract;
          }
        }
      }
    }

    if (!resolvedContract) {
      throw new ConfigViolation(
        `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`,
      );
    }

    logToSpan({
      level: 'INFO',
      message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resolvedContract.uri}', version='${resolvedContract.version}')`,
    });
    if (parsedEventDataSchema.uri !== resolvedContract.uri) {
      throw new Error(
        `Contract URI mismatch: ${contractType} Contract(uri='${resolvedContract.uri}', type='${resolvedContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }
    if (
      !isWildCardArvoSematicVersion(parsedEventDataSchema.version) &&
      parsedEventDataSchema.version !== resolvedContract.version
    ) {
      throw new Error(
        `Contract version mismatch: ${contractType} Contract(version='${resolvedContract.version}', type='${resolvedContract.accepts.type}', uri=${resolvedContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }

    const validationSchema: z.AnyZodObject =
      contractType === 'self'
        ? resolvedContract.accepts.schema
        : (resolvedContract.emits[event.type] ?? resolvedContract.systemError.schema);

    validationSchema.parse(event.data);
    return { contractType };
  }

  /**
   * Creates emittable event from execution result
   * @param event - Source event to emit
   * @param otelHeaders - OpenTelemetry headers
   * @param orchestrationParentSubject - Parent orchestration subject
   * @param sourceEvent - Original triggering event
   * @param selfVersionedContract - The self versioned contract
   * @param initEventId - The id of the event which initiated the orchestration in the first place
   *
   * @throws {ContractViolation} On schema/contract mismatch
   * @throws {ExecutionViolation} On invalid parentSubject$$ format
   */
  protected createEmittableEvent(
    event: EnqueueArvoEventActionParam,
    otelHeaders: OpenTelemetryHeaders,
    orchestrationParentSubject: string | null,
    sourceEvent: ArvoEvent,
    selfVersionedContract: VersionedArvoContract<TSelfContract, ArvoSemanticVersion>,
    initEventId: string,
  ): ArvoEvent {
    logToSpan({
      level: 'INFO',
      message: `Creating emittable event: ${event.type}`,
    });
    const serviceContract: Record<
      string,
      VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
    > = Object.fromEntries(
      (Object.values(this.contracts.services) as VersionedArvoContract<ArvoContract, ArvoSemanticVersion>[]).map(
        (item) => [item.accepts.type, item],
      ),
    );
    let schema: z.ZodTypeAny | null = null;
    let contract: VersionedArvoContract<any, any> | null = null;
    let subject: string = sourceEvent.subject;
    let parentId: string = sourceEvent.id;
    if (event.type === selfVersionedContract.metadata.completeEventType) {
      logToSpan({
        level: 'INFO',
        message: `Creating event for machine workflow completion: ${event.type}`,
      });
      contract = selfVersionedContract;
      schema = selfVersionedContract.emits[selfVersionedContract.metadata.completeEventType];
      subject = orchestrationParentSubject ?? sourceEvent.subject;
      parentId = initEventId;
    } else if (serviceContract[event.type]) {
      logToSpan({
        level: 'INFO',
        message: `Creating service event for external system: ${event.type}`,
      });
      contract = serviceContract[event.type];
      schema = serviceContract[event.type].accepts.schema;

      // If the event is to call another orchestrator then, extract the parent subject
      // passed to it and then form an new subject. This allows for event chaining
      // between orchestrators
      if ((contract as any).metadata.contractType === 'ArvoOrchestratorContract') {
        if (event.data.parentSubject$$) {
          try {
            ArvoOrchestrationSubject.parse(event.data.parentSubject$$);
          } catch (e) {
            throw new ExecutionViolation(
              `Invalid parentSubject$$ for the event(type='${event.type}', uri='${event.dataschema ?? EventDataschemaUtil.create(contract)}').It must be follow the ArvoOrchestrationSubject schema. The easiest way is to use the current orchestration subject by storing the subject via the context block in the machine definition.`,
            );
          }
        }

        try {
          if (event.data.parentSubject$$) {
            subject = ArvoOrchestrationSubject.from({
              orchestator: contract.accepts.type,
              version: contract.version,
              subject: event.data.parentSubject$$,
              meta: {
                redirectto: event.redirectto ?? this.source,
              },
            });
          } else {
            subject = ArvoOrchestrationSubject.new({
              version: contract.version,
              orchestator: contract.accepts.type,
              initiator: this.source,
              meta: {
                redirectto: event.redirectto ?? this.source,
              },
            });
          }
        } catch (error) {
          // This is a execution violation because it indicates faulty parent subject
          // or some fundamental error with subject creation which must be not be propagated
          // any further and investigated manually.
          throw new ExecutionViolation(
            `Orchestration subject creation failed due to invalid parameters - Event: ${event.type} - Check event emit parameters in the machine definition. ${(error as Error)?.message}`,
          );
        }
      }
    }

    let finalDataschema: string | undefined = event.dataschema;
    let finalData: any = event.data;
    // finally if the contract and the schema are available
    // then use them to validate the event. Otherwise just use
    // the data from the incoming event which is raw and created
    // by the machine
    if (contract && schema) {
      try {
        finalData = schema.parse(event.data);
        finalDataschema = EventDataschemaUtil.create(contract);
      } catch (error) {
        throw new ContractViolation(
          `Invalid event data: Schema validation failed - Check emit parameters in machine definition.\nEvent type: ${event.type}\nDetails: ${(error as Error).message}`,
        );
      }
    }

    // Create the event
    const emittableEvent = createArvoEvent(
      {
        source: this.source,
        type: event.type,
        subject: subject,
        dataschema: finalDataschema ?? undefined,
        data: finalData,
        to: event.to ?? event.type,
        accesscontrol: event.accesscontrol ?? sourceEvent.accesscontrol ?? undefined,
        // The orchestrator/ resumable does not respect redirectto from the source event
        redirectto: event.redirectto ?? this.source,
        executionunits: event.executionunits ?? this.executionunits,
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
        parentid: parentId,
      },
      event.__extensions ?? {},
    );

    logToSpan({
      level: 'INFO',
      message: `Event created successfully: ${emittableEvent.type}`,
    });

    return emittableEvent;
  }

  /**
   * Executes the orchestration workflow for an incoming event
   *
   * This is the main orchestration entry point that coordinates the complete event
   * processing lifecycle. It implements the core workflow execution pattern including
   * validation, locking, state management, handler invocation, event creation, and
   * persistence with comprehensive error handling and observability.
   *
   * The execution process follows these phases:
   * 1. **Validation & Setup** - Subject parsing, handler resolution, contract validation
   * 2. **Resource Management** - Distributed lock acquisition and state loading
   * 3. **Handler Execution** - Context preparation and user handler invocation
   * 4. **Event Processing** - Result transformation and emittable event creation
   * 5. **State Persistence** - Atomic state updates and event tracking
   * 6. **Cleanup & Return** - Resource release and structured result return
   *
   * @param event - The triggering event to process
   * @param opentelemetry - OpenTelemetry configuration for trace inheritance
   *
   * @returns Object containing emitted events organized by routing domains
   * @returns result.events - Events in the default domain for immediate processing
   * @returns result.allEventDomains - List of all domain names with events
   * @returns result.domainedEvents - Events organized by domain for routing
   * @returns result.domainedEvents.all - All emitted events regardless of domain
   *
   * @throws {TransactionViolation} When distributed lock acquisition fails
   * @throws {ConfigViolation} When handler resolution or contract validation fails
   * @throws {ContractViolation} When event schema validation fails
   * @throws {ExecutionViolation} When workflow execution encounters critical errors
   *
   * @remarks
   * **Execution Safety:**
   * The method implements comprehensive error recovery with proper resource cleanup
   * in all execution paths. ViolationErrors are rethrown for system handling while
   * workflow errors become system error events for graceful degradation.
   *
   * **State Management:**
   * Workflow state is managed atomically with optimistic concurrency control.
   * Status transitions from 'active' to 'done' occur only when completion events
   * are generated, ensuring proper workflow lifecycle management.
   *
   * **Observability:**
   * Complete execution is traced using OpenTelemetry with detailed span attributes
   * for debugging and monitoring. Event metadata includes processing context and
   * routing information for operational visibility.
   *
   * **Terminal State Handling:**
   * Workflows in 'done' status ignore additional events to prevent state corruption
   * while preserving audit trails for completed workflow executions.
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
    allEventDomains: string[];
    domainedEvents: {
      all: ArvoEvent[];
    } & Partial<Record<string, ArvoEvent[]>>;
  }> {
    return ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `ArvoResumable<${this.contracts.self.uri}>@<${event.type}>`,
      spanOptions: {
        kind: SpanKind.PRODUCER,
        attributes: {
          [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
          [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
          ...Object.fromEntries(
            Object.entries(event.otelAttributes).map(([key, value]) => [`to_process.0.${key}`, value]),
          ),
        },
      },
      context:
        opentelemetry.inheritFrom === 'EVENT'
          ? {
              inheritFrom: 'TRACE_HEADERS',
              traceHeaders: {
                traceparent: event.traceparent,
                tracestate: event.tracestate,
              },
            }
          : {
              inheritFrom: 'CONTEXT',
              context: context.active(),
            },
      disableSpanManagement: true,
      fn: async (span) => {
        logToSpan({
          level: 'INFO',
          message: `Resumable function starting execution for ${event.type} on subject ${event.subject}`,
        });
        const otelHeaders = currentOpenTelemetryHeaders();
        let orchestrationParentSubject: string | null = null;
        let acquiredLock: AcquiredLockStatusType | null = null;
        let initEventId: string | null = null;
        try {
          ///////////////////////////////////////////////////////////////
          // Subject resolution, handler resolution and input validation
          ///////////////
          // ////////////////////////////////////////////////
          this.syncEventResource.validateEventSubject(event);
          const parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
          span.setAttributes({
            'arvo.parsed.subject.orchestrator.name': parsedEventSubject.orchestrator.name,
            'arvo.parsed.subject.orchestrator.version': parsedEventSubject.orchestrator.version,
          });

          // The wrong source is not a big violation. May be some routing went wrong. So just ignore the event
          if (parsedEventSubject.orchestrator.name !== this.source) {
            logToSpan({
              level: 'WARNING',
              message: `Event subject mismatch detected. Expected orchestrator '${this.source}' but subject indicates '${parsedEventSubject.orchestrator.name}'. This indicates either a routing error or a non-applicable event that can be safely ignored.`,
            });

            logToSpan({
              level: 'INFO',
              message: 'Orchestration executed with issues and emitted 0 events',
            });
            return {
              events: [],
              allEventDomains: [],
              domainedEvents: {
                all: [],
              },
            };
          }

          logToSpan({
            level: 'INFO',
            message: `Resolving machine for event ${event.type}`,
          });

          // Handler not found means that the handler is not defined which is not allowed and a critical bug
          if (!this.handler[parsedEventSubject.orchestrator.version]) {
            throw new ConfigViolation(
              `Handler resolution failed: No handler found matching orchestrator name='${parsedEventSubject.orchestrator.name}' and version='${parsedEventSubject.orchestrator.version}'.`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Input validation started for event ${event.type}`,
          });

          const { contractType } = this.validateInput(event);

          ///////////////////////////////////////////////////////////////
          // State locking, acquiry and handler exection
          ///////////////////////////////////////////////////////////////
          acquiredLock = await this.syncEventResource.acquireLock(event);

          if (acquiredLock === 'NOT_ACQUIRED') {
            throw new TransactionViolation({
              cause: TransactionViolationCause.LOCK_UNACQUIRED,
              message: 'Lock acquisition denied - Unable to obtain exclusive access to event processing',
              initiatingEvent: event,
            });
          }

          if (acquiredLock === 'ACQUIRED') {
            logToSpan({
              level: 'INFO',
              message: `This execution acquired lock at resource '${event.subject}'`,
            });
          }

          // Acquiring state
          const state = await this.syncEventResource.acquireState(event);
          orchestrationParentSubject = state?.parentSubject ?? null;
          initEventId = state?.initEventId ?? event.id;

          if (state?.status === 'done') {
            logToSpan({
              level: 'INFO',
              message: `The resumable has already reached the terminal state. Ignoring event(id=${event.id})`,
            });

            return {
              events: [],
              allEventDomains: [],
              domainedEvents: {
                all: [],
              },
            };
          }

          if (!state) {
            logToSpan({
              level: 'INFO',
              message: `Initializing new execution state for subject: ${event.subject}`,
            });

            if (event.type !== this.source) {
              logToSpan({
                level: 'WARNING',
                message: `Invalid initialization event detected. Expected type '${this.source}' but received '${event.type}'. This may indicate an incorrectly routed event or a non-initialization event that can be safely ignored.`,
              });

              return {
                events: [],
                allEventDomains: [],
                domainedEvents: {
                  all: [],
                },
              };
            }
          } else {
            logToSpan({
              level: 'INFO',
              message: `Resuming execution with existing state for subject: ${event.subject}`,
            });
          }

          // In case the event is the init event then
          // extract the parent subject from it and assume
          // it to be the orchestration parent subject
          if (event.type === this.source) {
            orchestrationParentSubject = event?.data?.parentSubject$$ ?? null;
          }

          // This is not persisted until handling. The reason is that if the event
          // is causing a fault then what is the point of persisting it
          if (
            event.parentid &&
            state?.events?.expected?.[event.parentid] &&
            Array.isArray(state?.events?.expected?.[event.parentid])
          ) {
            state.events.expected[event.parentid].push(event.toJSON());
          }

          const eventTypeToExpectedEvent: Record<string, InferArvoEvent<ArvoEvent>[]> = {};
          for (const [_, eventList] of Object.entries(state?.events?.expected ?? {})) {
            for (const _evt of eventList) {
              if (!eventTypeToExpectedEvent[_evt.type]) {
                eventTypeToExpectedEvent[_evt.type] = [];
              }
              eventTypeToExpectedEvent[_evt.type].push(_evt);
            }
          }

          const handler = this.handler[parsedEventSubject.orchestrator.version];
          const executionResult = await handler({
            span: span,
            context: state?.state$$ ?? null,
            metadata: state ?? null,
            collectedEvents: eventTypeToExpectedEvent,
            init: contractType === 'self' ? (event.toJSON() as any) : null,
            service: contractType === 'service' ? event.toJSON() : null,
            contracts: {
              self: this.contracts.self.version(parsedEventSubject.orchestrator.version),
              services: this.contracts.services,
            },
          });

          ///////////////////////////////////////////////////////////////
          // Event segregation, creation, state persitance and return result
          ///////////////////////////////////////////////////////////////

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const domainedEvents: Record<string, ArvoEvent[]> = {};
          const emittables: ArvoEvent[] = [];
          const eventIdToDomainMap: Record<string, string[]> = {};

          for (const item of [
            ...(executionResult?.complete
              ? [
                  {
                    ...executionResult.complete,
                    type: this.contracts.self.metadata.completeEventType,
                    to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
                  },
                ]
              : []),
            ...(executionResult?.services ? executionResult.services : []),
          ]) {
            const domains = item.domains ?? ['default'];
            const evt = this.createEmittableEvent(
              item,
              otelHeaders,
              orchestrationParentSubject,
              event,
              this.contracts.self.version(parsedEventSubject.orchestrator.version),
              initEventId,
            );
            eventIdToDomainMap[evt.id] = domains;
            emittables.push(evt);
            for (const tag of domains) {
              if (!domainedEvents[tag]) {
                domainedEvents[tag] = [];
              }
              domainedEvents[tag].push(evt);
            }
          }

          emittables.forEach((item, index) => {
            // biome-ignore lint/complexity/noForEach: non issue
            Object.entries(item.otelAttributes).forEach(([key, value]) => {
              span.setAttribute(`to_emit.${index}.${key}`, value);
            });
            eventIdToDomainMap[item.id].forEach((dom, domIndex) => {
              span.setAttribute(`to_emit.${index}.domains.${domIndex}`, dom);
            });
          });

          logToSpan({
            level: 'INFO',
            message: `Resumable execution completed. Generated events: ${emittables.length}`,
          });

          const producedEvents = {
            events: domainedEvents.default ?? [],
            allEventDomains: Object.keys(domainedEvents),
            domainedEvents: {
              all: emittables,
              ...domainedEvents,
            },
          };

          // If the handler emits new events, then forget about
          // the old events and recreate expected event map.
          const eventTrackingState: ArvoResumableState<any>['events'] = {
            consumed: event,
            expected: emittables.length
              ? Object.fromEntries(emittables.map((item) => [item.id, []]))
              : (state?.events.expected ?? null),
            produced: emittables.length
              ? (() => {
                  const evtMap: Record<string, { domains: string[] } & InferArvoEvent<ArvoEvent>> = {};
                  for (const [domain, events] of Object.entries(domainedEvents)) {
                    for (const evt of events) {
                      if (evtMap[evt.id]) {
                        evtMap[evt.id].domains.push(domain);
                      } else {
                        // @ts-ignore
                        evtMap[evt.id] = {
                          ...evt.toJSON(),
                          domains: [domain],
                        };
                      }
                    }
                  }
                  return evtMap;
                })()
              : null,
          };

          // Write to the memory
          await this.syncEventResource.persistState(
            event,
            {
              status: executionResult?.complete ? 'done' : 'active',
              initEventId,
              parentSubject: orchestrationParentSubject,
              subject: event.subject,
              events: eventTrackingState,
              state$$: executionResult?.context ?? state?.state$$ ?? null,
            },
            state,
            span,
          );

          logToSpan({
            level: 'INFO',
            message: `State update persisted in memory for subject ${event.subject}`,
          });

          logToSpan({
            level: 'INFO',
            message: `Resumable successfully executed and emitted ${emittables.length} events`,
          });

          return producedEvents;
        } catch (error: unknown) {
          // If this is not an error this is not expected and must be addressed
          // This is a fundmental unexpected scenario and must be handled as such
          // What this show is the there is a non-error object being throw in the
          // implementation or execution of the machine which is a major NodeJS
          // violation
          const e: Error = isError(error)
            ? error
            : new ExecutionViolation(
                `Non-Error object thrown during machine execution: ${typeof error}. This indicates a serious implementation flaw.`,
              );
          exceptionToSpan(e);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: e.message,
          });

          // For any violation errors bubble them up to the
          // called of the function so that they can
          // be handled gracefully
          if ((e as ViolationError).name.includes('ViolationError')) {
            logToSpan({
              level: 'CRITICAL',
              message: `Resumable violation error: ${e.message}`,
            });
            throw e;
          }

          logToSpan({
            level: 'ERROR',
            message: `Resumable execution failed: ${e.message}`,
          });

          // In case of none transaction errors like errors from
          // the machine or the event creation etc, the are workflow
          // error and shuold be handled by the workflow. Then are
          // called system error and must be sent
          // to the initiator. In as good of a format as possible
          let parsedEventSubject: ArvoOrchestrationSubjectContent | null = null;
          try {
            parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
          } catch (e) {
            logToSpan({
              level: 'WARNING',
              message: `Unable to parse event subject: ${(e as Error).message}`,
            });
          }

          const errorEvent = createArvoOrchestratorEventFactory(this.contracts.self.version('any')).systemError({
            source: this.source,
            // If the initiator of the workflow exist then match the
            // subject so that it can incorporate it in its state. If
            // parent does not exist then this is the root workflow so
            // use its own subject
            subject: orchestrationParentSubject ?? event.subject,
            // The system error must always go back to
            // the source which initiated it
            to: parsedEventSubject?.execution.initiator ?? event.source,
            error: e,
            traceparent: otelHeaders.traceparent ?? undefined,
            tracestate: otelHeaders.tracestate ?? undefined,
            accesscontrol: event.accesscontrol ?? undefined,
            executionunits: this.executionunits,
            // If there is initEventID then use that.
            // Otherwise, use event id. If the error is in init event
            // then it will be the same as initEventId. Otherwise,
            // we still would know what cause this error
            parentid: initEventId ? initEventId : event.id,
          });
          // biome-ignore lint/complexity/noForEach: non issue
          Object.entries(errorEvent.otelAttributes).forEach(([key, value]) => {
            span.setAttribute(`to_emit.0.${key}`, value);
          });
          return {
            events: [errorEvent],
            allEventDomains: ['default'],
            domainedEvents: {
              all: [errorEvent],
              default: [errorEvent],
            },
          };
        } finally {
          await this.syncEventResource.releaseLock(event, acquiredLock, span);
          span.end();
        }
      },
    });
  }

  get systemErrorSchema() {
    return this.contracts.self.systemError;
  }
}
