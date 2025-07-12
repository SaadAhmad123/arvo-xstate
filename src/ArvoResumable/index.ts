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
//import { TransactionViolation, TransactionViolationCause, type IMachineMemory } from 'arvo-xstate';
import type { z } from 'zod';
import type { ArvoResumableHandler, ArvoResumableState } from './types.js';
import { isError } from '../utils/index.js';
import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrator/error.js';
import type { IMachineMemory } from '../MachineMemory/interface.js';
import { SyncEventResource } from '../SyncEventResource/index.js';
import type { AcquiredLockStatusType } from '../SyncEventResource/types.js';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types.js';

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
    let resovledContract: VersionedArvoContract<any, any> | null = null;
    let contractType: 'self' | 'service';

    const parsedEventDataSchema = EventDataschemaUtil.parse(event);
    if (!parsedEventDataSchema) {
      throw new ExecutionViolation(
        `Event dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}'). This makes the event opaque and does not allow contract resolution`,
      );
    }

    if (event.type === this.contracts.self.type) {
      contractType = 'self';
      resovledContract = this.contracts.self.version(parsedEventDataSchema.version);
    } else {
      contractType = 'service';
      for (const contract of Object.values(this.contracts.services)) {
        if (resovledContract) break;
        for (const emitType of [...contract.emitList, contract.systemError]) {
          if (resovledContract) break;
          if (event.type === emitType) {
            resovledContract = contract;
          }
        }
      }
    }

    if (!resovledContract) {
      throw new ConfigViolation(
        `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`,
      );
    }

    logToSpan({
      level: 'INFO',
      message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resovledContract.uri}', version='${resovledContract.version}')`,
    });
    if (parsedEventDataSchema.uri !== resovledContract.uri) {
      throw new Error(
        `Contract URI mismatch: ${contractType} Contract(uri='${resovledContract.uri}', type='${resovledContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }
    if (
      !isWildCardArvoSematicVersion(parsedEventDataSchema.version) &&
      parsedEventDataSchema.version !== resovledContract.version
    ) {
      throw new Error(
        `Contract version mismatch: ${contractType} Contract(version='${resovledContract.version}', type='${resovledContract.accepts.type}', uri=${resovledContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }

    const validationSchema: z.AnyZodObject =
      contractType === 'self'
        ? resovledContract.accepts.schema
        : (resovledContract.emits[event.type] ?? resovledContract.systemError.schema);

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
      name: `Resumable<${this.contracts.self.uri}>@<${event.type}>`,
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
        let initEventId: string;
        try {
          this.syncEventResource.validateEventSubject(event);
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
          } else {
            logToSpan({
              level: 'INFO',
              message: `Resuming execution with existing state for subject: ${event.subject}`,
            });

            if (ArvoOrchestrationSubject.parse(event.subject).orchestrator.name !== this.source) {
              logToSpan({
                level: 'WARNING',
                message: `Event subject mismatch detected. Expected orchestrator '${this.source}' but subject indicates '${ArvoOrchestrationSubject.parse(event.subject).orchestrator.name}'. This indicates either a routing error or a non-applicable event that can be safely ignored.`,
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
          }

          // In case the event is the init event then
          // extract the parent subject from it and assume
          // it to be the orchestration parent subject
          if (event.type === this.source) {
            orchestrationParentSubject = event?.data?.parentSubject$$ ?? null;
          }

          logToSpan({
            level: 'INFO',
            message: `Input validation started for event ${event.type}`,
          });

          const { contractType } = this.validateInput(event);

          // biome-ignore lint/style/noNonNullAssertion: This is safe because it is validated in the `this.validateInput(event);` above
          const parsedEventDataSchema = EventDataschemaUtil.parse(event)!;
          const selfVersionedContract = this.contracts.self.version(parsedEventDataSchema.version);
          const handler = this.handler[selfVersionedContract.version];

          if (state?.events?.expected?.[event.id]) {
            state.events.expected[event.id].push(event.toJSON());
          }

          const executionResult = await handler({
            span: span,
            state: state?.state$$ ?? null,
            metadata: state ?? null,
            // @ts-ignore
            init: contractType === 'self' ? event.toJSON() : null,
            service: contractType === 'service' ? event.toJSON() : null,
          });

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const domainedEvents: Record<string, ArvoEvent[]> = {};
          const emittables: ArvoEvent[] = [];
          const eventIdToDomainMap: Record<string, string[]> = {};

          for (const item of [
            ...(executionResult?.complete ? [executionResult.complete] : []),
            ...(executionResult?.services ? executionResult.services : []),
          ]) {
            const domains = item.domains ?? ['default'];
            const evt = this.createEmittableEvent(
              item,
              otelHeaders,
              orchestrationParentSubject,
              event,
              selfVersionedContract,
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
            eventIdToDomainMap[item.id].forEach((dom, index) => {
              span.setAttribute(`to_emit.${index}.domains.${index}`, dom);
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
                    if (evtMap[event.id]) {
                      evtMap[event.id].domains.push(domain);
                    } else {
                      // @ts-ignore
                      evtMap[event.id] = {
                        ...event.toJSON(),
                        domains: [domain],
                      };
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
              initEventId,
              parentSubject: orchestrationParentSubject,
              subject: event.subject,
              events: eventTrackingState,
              state$$: executionResult?.state ?? state?.state$$ ?? null,
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
            message: `Orchestration successfully executed and emitted ${emittables.length} events`,
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
            parentid: event.id,
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
