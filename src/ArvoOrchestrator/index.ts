import { SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import {
  type ArvoContract,
  type ArvoContractRecord,
  ArvoErrorSchema,
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  ArvoOrchestrationSubject,
  type ArvoOrchestrationSubjectContent,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  EventDataschemaUtil,
  type InferArvoEvent,
  OpenInference,
  OpenInferenceSpanKind,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  type ViolationError,
  createArvoEvent,
  createArvoOrchestratorEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  logToSpan,
} from 'arvo-core';
import {
  AbstractArvoEventHandler,
  type ArvoEventHandlerOpenTelemetryOptions,
  ConfigViolation,
  ContractViolation,
  ExecutionViolation,
} from 'arvo-event-handler';
import type { ActorLogic } from 'xstate';
import type { z } from 'zod';
import type ArvoMachine from '../ArvoMachine';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import type { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { IMachineRegistry } from '../MachineRegistry/interface';
import { isError } from '../utils';
import { TransactionViolation, TransactionViolationCause } from './error';
import type { IArvoOrchestrator, MachineMemoryRecord } from './types';
import { SyncEventResource } from '../SyncEventResource';
import type { AcquiredLockStatusType } from '../SyncEventResource/types';

/**
 * Orchestrates state machine execution and lifecycle management.
 * Handles machine resolution, state management, event processing and error handling.
 */
export class ArvoOrchestrator extends AbstractArvoEventHandler {
  readonly executionunits: number;
  readonly registry: IMachineRegistry;
  readonly executionEngine: IMachineExectionEngine;
  readonly syncEventResource: SyncEventResource<MachineMemoryRecord>;

  get source() {
    return this.registry.machines[0].source;
  }

  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  get memory(): IMachineMemory<MachineMemoryRecord> {
    return this.syncEventResource.memory;
  }

  /**
   * Creates a new orchestrator instance
   * @param params - Configuration parameters
   * @throws Error if machines in registry have different sources
   */
  constructor({ executionunits, memory, registry, executionEngine, requiresResourceLocking }: IArvoOrchestrator) {
    super();
    this.executionunits = executionunits;
    const representativeMachine = registry.machines[0];
    const lastSeenVersions: ArvoSemanticVersion[] = [];
    for (const machine of registry.machines) {
      if (representativeMachine.source !== machine.source) {
        throw new Error(`All the machines in the orchestrator must have type '${representativeMachine.source}'`);
      }
      if (lastSeenVersions.includes(machine.version)) {
        throw new Error(
          `An orchestrator must have unique machine versions. Machine ID:${machine.id} has duplicate version ${machine.version}.`,
        );
      }
      lastSeenVersions.push(machine.version);
    }
    this.registry = registry;
    this.executionEngine = executionEngine;
    this.syncEventResource = new SyncEventResource(memory, requiresResourceLocking);
  }

  /**
   * Creates emittable event from execution result
   * @param event - Source event to emit
   * @param machine - Machine that generated event
   * @param otelHeaders - OpenTelemetry headers
   * @param orchestrationParentSubject - Parent orchestration subject
   * @param sourceEvent - Original triggering event
   * @param initEventId - The id of the event which initiated the orchestration in the first place
   *
   * @throws {ContractViolation} On schema/contract mismatch
   * @throws {ExecutionViolation} On invalid parentSubject$$ format
   */
  protected createEmittableEvent(
    event: EnqueueArvoEventActionParam,
    machine: ArvoMachine<any, any, any, any, any>,
    otelHeaders: OpenTelemetryHeaders,
    orchestrationParentSubject: string | null,
    sourceEvent: ArvoEvent,
    initEventId: string,
  ): ArvoEvent {
    logToSpan({
      level: 'INFO',
      message: `Creating emittable event: ${event.type}`,
    });

    const selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion> = machine.contracts.self;
    const serviceContract: Record<
      string,
      VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
    > = Object.fromEntries(
      (Object.values(machine.contracts.services) as VersionedArvoContract<ArvoContract, ArvoSemanticVersion>[]).map(
        (item) => [item.accepts.type, item],
      ),
    );
    let schema: z.ZodTypeAny | null = null;
    let contract: VersionedArvoContract<any, any> | null = null;
    let subject: string = sourceEvent.subject;
    let parentId: string = sourceEvent.id;
    if (event.type === selfContract.metadata.completeEventType) {
      logToSpan({
        level: 'INFO',
        message: `Creating event for machine workflow completion: ${event.type}`,
      });
      contract = selfContract;
      schema = selfContract.emits[selfContract.metadata.completeEventType];
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
        // The orchestrator does not respect redirectto from the source event
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
   * Core orchestration method that executes state machines in response to events.
   * Manages the complete event lifecycle:
   * 1. Acquires lock and state
   * 2. Validates events and contracts
   * 3. Executes state machine
   * 4. Persists new state
   * 5. Generates response events with domain-based segregation
   *
   * @param event - Event triggering the execution
   * @param opentelemetry - OpenTelemetry configuration
   * @returns Object containing default domained events, all event domains, and domain-segregated event buckets
   *
   * @throws {TransactionViolation} Lock/state operations failed
   * @throws {ExecutionViolation} Invalid event structure/flow
   * @throws {ContractViolation} Schema/contract mismatch
   * @throws {ConfigViolation} Missing/invalid machine version
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<{
    events: ArvoEvent[];
    allEventDomains: string[];
    domainedEvents: {
      all: ArvoEvent[];
    } & Partial<Record<string, ArvoEvent[]>>;
  }> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `Orchestrator<${this.registry.machines[0].contracts.self.uri}>@<${event.type}>`,
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
          message: `Orchestrator starting execution for ${event.type} on subject ${event.subject}`,
        });
        const otelHeaders = currentOpenTelemetryHeaders();
        let orchestrationParentSubject: string | null = null;
        let initEventId: string | null = null;
        let acquiredLock: AcquiredLockStatusType | null = null;
        try {
          ///////////////////////////////////////////////////////////////
          // Subject resolution, machine resolution and input validation
          ///////////////////////////////////////////////////////////////
          this.syncEventResource.validateEventSubject(event, span);
          const parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
          span.setAttributes({
            'arvo.parsed.subject.orchestrator.name': parsedEventSubject.orchestrator.name,
            'arvo.parsed.subject.orchestrator.version': parsedEventSubject.orchestrator.version,
          });

          // The wrong source is not a big violation. May be some routing went wrong. So just ignore
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

          const machine = this.registry.resolve(event, {
            inheritFrom: 'CONTEXT',
          });

          // Unable to find a machine is a big configuration bug and violation
          if (!machine) {
            const { name, version } = parsedEventSubject.orchestrator;
            throw new ConfigViolation(
              `Machine resolution failed: No machine found matching orchestrator name='${name}' and version='${version}'.`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Input validation started for event ${event.type} on machine ${machine.source}`,
          });

          // Validate the event againt the events that can be
          // recieved by the machine. The orchestrator must only
          // allow event which the machine is expecting as input
          // to be futher processed.
          // The machine however should be able to emit any events
          const inputValidation = machine.validateInput(event);

          if (inputValidation.type === 'CONTRACT_UNRESOLVED') {
            // This is a configuration error because the contract was never
            // configured in the machine. That is why it was unresolved. It
            // signifies a problem in configration not the data or event flow
            throw new ConfigViolation(
              'Contract validation failed - Event does not match any registered contract schemas in the machine',
            );
          }

          if (inputValidation.type === 'INVALID_DATA' || inputValidation.type === 'INVALID') {
            // This is a contract error becuase there is a configuration but
            // the event data received was invalid due to conflicting data
            // or event dataschema did not match the contract data schema. This
            // signifies an issue with event flow because unexpected events
            // are being received
            throw new ContractViolation(
              `Input validation failed - Event data does not meet contract requirements: ${inputValidation.error.message}`,
            );
          }

          ///////////////////////////////////////////////////////////////
          // State locking, acquiry machine exection
          ///////////////////////////////////////////////////////////////
          acquiredLock = await this.syncEventResource.acquireLock(event, span);
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
          const state = await this.syncEventResource.acquireState(event, span);
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

          // Execute the raw machine and collect the result
          // The result basically contain RAW events from the
          // machine which will then transformed to be real ArvoEvents
          const executionResult = this.executionEngine.execute(
            {
              state: state?.state ?? null,
              event,
              machine,
            },
            { inheritFrom: 'CONTEXT' },
          );

          span.setAttribute('arvo.orchestration.status', executionResult.state.status);

          const rawMachineEmittedEvents = executionResult.events;

          // In case execution of the machine has finished
          // and the final output has been created, then in
          // that case, make the raw event as the final output
          // is not even raw enough to be called an event yet
          if (executionResult.finalOutput) {
            rawMachineEmittedEvents.push({
              type: (machine.contracts.self as VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>)
                .metadata.completeEventType,
              data: executionResult.finalOutput,
              to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
            });
          }

          ///////////////////////////////////////////////////////////////
          // Event segregation, creation, state persitance and return result
          ///////////////////////////////////////////////////////////////

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const domainedEvents: Record<string, ArvoEvent[]> = {};
          const emittables: ArvoEvent[] = [];
          const eventIdToDomainMap: Record<string, string[]> = {};

          for (const item of rawMachineEmittedEvents) {
            const domains = item.domains ?? ['default'];
            const evt = this.createEmittableEvent(
              item,
              machine,
              otelHeaders,
              orchestrationParentSubject,
              event,
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
            message: `Machine execution completed - Status: ${executionResult.state.status}, Generated events: ${executionResult.events.length}`,
          });

          const producedEvents = {
            events: domainedEvents.default ?? [],
            allEventDomains: Object.keys(domainedEvents),
            domainedEvents: {
              all: emittables,
              ...domainedEvents,
            },
          };

          // Write to the memory
          await this.syncEventResource.persistState(
            event,
            {
              initEventId,
              subject: event.subject,
              parentSubject: orchestrationParentSubject,
              status: executionResult.state.status,
              value: (executionResult.state as any).value ?? null,
              state: executionResult.state,
              events: {
                consumed: event,
                produced: (() => {
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
                })(),
              },
              machineDefinition: JSON.stringify((machine.logic as ActorLogic<any, any, any, any, any>).config),
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
          // If this is not an error this is not exected and must be addressed
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
              message: `Orchestrator violation error: ${e.message}`,
            });
            throw e;
          }

          logToSpan({
            level: 'ERROR',
            message: `Orchestrator execution failed: ${e.message}`,
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

          const errorEvent = createArvoOrchestratorEventFactory(this.registry.machines[0].contracts.self).systemError({
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

  /**
   * Gets the error schema for this orchestrator
   */
  get systemErrorSchema(): ArvoContractRecord {
    return {
      type: this.registry.machines[0].contracts.self.systemError.type,
      schema: ArvoErrorSchema,
    };
  }
}
