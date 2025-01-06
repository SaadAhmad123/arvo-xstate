import {
  ArvoContractRecord,
  ArvoErrorSchema,
  ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  ArvoSemanticVersion,
  createArvoOrchestratorEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  logToSpan,
  OpenInference,
  OpenInferenceSpanKind,
  VersionedArvoContract,
  ArvoOrchestratorContract,
  ArvoContract,
  OpenTelemetryHeaders,
  createArvoEvent,
  EventDataschemaUtil,
  ArvoOrchestrationSubject,
  ArvoOrchestrationSubjectContent,
} from 'arvo-core';
import { IMachineMemory } from '../MachineMemory/interface';
import {
  IArvoOrchestrator,
  MachineMemoryRecord,
  TryFunctionOutput,
} from './types';
import {
  AbstractArvoEventHandler,
  ArvoEventHandlerOpenTelemetryOptions,
} from 'arvo-event-handler';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { ArvoOrchestratorError } from './error';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import ArvoMachine from '../ArvoMachine';
import { z } from 'zod';
import { IMachineRegistry } from '../MachineRegistry/interface';
import { IMachineExectionEngine } from '../MachineExecutionEngine/interface';

/**
 * Orchestrates state machine execution and lifecycle management.
 * Handles machine resolution, state management, event processing and error handling.
 */
export class ArvoOrchestrator extends AbstractArvoEventHandler {
  readonly executionunits: number;
  readonly memory: IMachineMemory<MachineMemoryRecord>;
  readonly registry: IMachineRegistry;
  readonly executionEngine: IMachineExectionEngine;
  readonly requiresResourceLocking: boolean;

  /**
   * Gets the source identifier for this orchestrator
   */
  get source() {
    return this.registry.machines[0].source;
  }

  /**
   * Creates a new orchestrator instance
   * @param params - Configuration parameters
   * @throws Error if machines in registry have different sources
   */
  constructor({
    executionunits,
    memory,
    registry,
    executionEngine,
    requiresResourceLocking,
  }: IArvoOrchestrator) {
    super();
    this.executionunits = executionunits;
    this.memory = memory;
    const representativeMachine = registry.machines[0];
    let lastSeenVersions: ArvoSemanticVersion[] = [];
    for (const machine of registry.machines) {
      if (representativeMachine.source !== machine.source) {
        throw new Error(
          `All the machines in the orchestrator must have type '${representativeMachine.source}'`,
        );
      }
      if (lastSeenVersions.includes(machine.version)) {
        throw new Error(
          `An orchestrator must have unique machine versions. Machine ID:${machine.id} has duplicate version ${machine.version}.`,
        );
      } else {
        lastSeenVersions.push(machine.version);
      }
    }
    this.registry = registry;
    this.executionEngine = executionEngine;
    this.requiresResourceLocking = requiresResourceLocking
  }

  protected async acquireLock(
    event: ArvoEvent,
  ): Promise<TryFunctionOutput<boolean, ArvoOrchestratorError>> {
    if (!this.requiresResourceLocking) {
      logToSpan({
        level: 'INFO',
        message: 'Skipping acquiring lock as the orchestrator implements only sequential machines.'
      })
      return {
        type: 'success',
        data: true
      }
    }
    const id: string = event.subject;
    try {
      logToSpan({
        level: 'INFO',
        message: 'Attempting to acquire lock for event ',
      });
      return {
        type: 'success',
        data: await this.memory.lock(id),
      };
    } catch (e) {
      exceptionToSpan(e as Error);
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: (e as Error).message,
      });
      return {
        type: 'error',
        error: new ArvoOrchestratorError({
          name: 'ACQUIRE_LOCK',
          message: `Error acquiring lock (id=${id}): ${(e as Error).message}`,
          initiatingEvent: event,
        }),
      };
    }
  }

  protected async acquireState(
    event: ArvoEvent,
  ): Promise<
    TryFunctionOutput<MachineMemoryRecord | null, ArvoOrchestratorError>
  > {
    const id: string = event.subject;
    try {
      return {
        type: 'success',
        data: await this.memory.read(id),
      };
    } catch (e) {
      exceptionToSpan(e as Error);
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: (e as Error).message,
      });
      return {
        type: 'error',
        error: new ArvoOrchestratorError({
          name: 'READ_MACHINE_MEMORY',
          message: `Error reading state (id=${id}): ${(e as Error).message}`,
          initiatingEvent: event,
        }),
      };
    }
  }

  /**
   * Creates emittable event from execution result
   * @param event - Source event to emit
   * @param machine - Machine that generated event
   * @param otelHeaders - OpenTelemetry headers
   * @param orchestrationParentSubject - Parent orchestration subject
   * @param sourceEvent - Original triggering event
   */
  protected createEmittableEvent(
    event: EnqueueArvoEventActionParam,
    machine: ArvoMachine<any, any, any, any, any>,
    otelHeaders: OpenTelemetryHeaders,
    orchestrationParentSubject: string | null,
    sourceEvent: ArvoEvent,
  ): ArvoEvent {
    logToSpan({
      level: 'INFO',
      message: `Creating emittable event: ${event.type}`,
    });

    const selfContract: VersionedArvoContract<
      ArvoOrchestratorContract,
      ArvoSemanticVersion
    > = machine.contracts.self;
    const serviceContract: Record<
      string,
      VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
    > = Object.fromEntries(
      (
        Object.values(machine.contracts.services) as VersionedArvoContract<
          ArvoContract,
          ArvoSemanticVersion
        >[]
      ).map((item) => [item.accepts.type, item]),
    );
    let schema: z.ZodTypeAny | null = null;
    let contract: VersionedArvoContract<any, any> | null = null;
    let subject: string = sourceEvent.subject;
    if (event.type === selfContract.metadata.completeEventType) {
      logToSpan({
        level: 'INFO',
        message: `Creating event for machine workflow completion: ${event.type}`,
      });
      contract = selfContract;
      schema = selfContract.emits[selfContract.metadata.completeEventType];
      subject = orchestrationParentSubject ?? sourceEvent.subject;
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
      if (
        (contract as any).metadata.contractType === 'ArvoOrchestratorContract'
      ) {
        if (event.data.parentSubject$$) {
          try {
            ArvoOrchestrationSubject.parse(event.data.parentSubject$$);
          } catch (e) {
            throw new Error(
              `Invalid parentSubject$$ for the event(type='${event.type}', uri='${event.dataschema ?? EventDataschemaUtil.create(contract)}').` +
                'It must be follow the ArvoOrchestrationSubject schema. The easiest way is to use the ' +
                'current orchestration subject by storing the subject via the context block in the machine' +
                'definition.',
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
          logToSpan({
            level: 'ERROR',
            message: `Orchestration subject creation failed due to invalid parameters - Event: ${event.type}`,
          });
          throw error;
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
        logToSpan({
          level: 'ERROR',
          message: `Event data validation failed - Schema requirements not met: ${(error as Error).message}`,
        });
        throw error;
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
        accesscontrol:
          event.accesscontrol ?? sourceEvent.accesscontrol ?? undefined,
        // The orchestrator does not respect redirectto from the source event
        redirectto: event.redirectto ?? this.source,
        executionunits: event.executionunits ?? this.executionunits,
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
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
   * Executes a state machine in response to an event.
   * Handles the complete lifecycle including state management, event processing and error handling.
   *
   * @param event - Event triggering the execution
   * @param opentelemetry - OpenTelemetry configuration
   * @returns Array of events generated during execution
   * @throws ArvoOrchestratorError on execution failures
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<ArvoEvent[]> {
    let thisSessionAcquiredLock = false;
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `Orchestrator<${this.registry.machines[0].contracts.self.uri}>`,
      spanOptions: {
        kind: SpanKind.PRODUCER,
        attributes: {
          [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
          [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
          ...Object.fromEntries(
            Object.entries(event.otelAttributes).map(([key, value]) => [
              `to_process.0.${key}`,
              value,
            ]),
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
        let lockAcquired: boolean = false;
        let state: MachineMemoryRecord | null = null;
        const lockAcquiryProcess = await this.acquireLock(event);
        if (lockAcquiryProcess.type === 'error') {
          logToSpan({
            level: 'ERROR',
            message: `Lock acquisition failed for subject ${event.subject} - ${lockAcquiryProcess.error.message}`,
          });
          span.end();
          throw lockAcquiryProcess.error;
        }
        const stateAcquiryProcess = await this.acquireState(event);
        if (stateAcquiryProcess.type === 'error') {
          logToSpan({
            level: 'ERROR',
            message: `State retrieval failed for subject ${event.subject} - ${stateAcquiryProcess.error.message}`,
          });
          span.end();
          throw stateAcquiryProcess.error;
        }
        lockAcquired = lockAcquiryProcess.data;
        state = stateAcquiryProcess.data;
        const otelHeaders = currentOpenTelemetryHeaders();
        let orchestrationParentSubject: string | null =
          state?.parentSubject ?? null;
        try {
          try {
            // Validate the input event subject
            ArvoOrchestrationSubject.parse(event.subject);
          } catch (e) {
            throw new Error(
              `Invalid event subject format. Expected an ArvoOrchestrationSubject but received '${event.subject}'. ` +
                `The subject must follow the format specified by ArvoOrchestrationSubject schema. ` +
                `Parsing error: ${(e as Error).message}`,
            );
          }

          if (!lockAcquired) {
            throw new Error(
              'Lock acquisition denied - Unable to obtain exclusive access to event processing',
            );
          } else {
            logToSpan({
              level: 'INFO',
              message: `This execution acquired lock at resource '${event.subject}'`,
            });
            thisSessionAcquiredLock = true;
          }

          if(!state) {
            logToSpan({
              level: 'INFO', 
              message: `Initializing new execution state for subject: ${event.subject}`,
            })
          
            if (event.type !== this.source) {
              logToSpan({
                level: 'WARNING',
                message: (
                  `Invalid initialization event detected. Expected type '${this.source}' but received '${event.type}'. ` +
                  `This may indicate an incorrectly routed event or a non-initialization event that can be safely ignored.`
                )
              })
              return []
            }
          } else {
            logToSpan({
              level: 'INFO',
              message: `Resuming execution with existing state for subject: ${event.subject}`
            })
          
            if (ArvoOrchestrationSubject.parse(event.subject).orchestrator.name !== this.source) {
              logToSpan({
                level: 'WARNING',
                message: (
                  `Event subject mismatch detected. Expected orchestrator '${this.source}' but subject indicates ` +
                  `'${ArvoOrchestrationSubject.parse(event.subject).orchestrator.name}'. ` +
                  `This indicates either a routing error or a non-applicable event that can be safely ignored.`
                )
              })
              return []
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
            message: `Resolving machine for event ${event.type}`,
          });

          const machine = this.registry.resolve(event, {
            inheritFrom: 'CONTEXT',
          });

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
            throw new Error(
              'Contract validation failed - Event does not match any registered contract schemas in the machine',
            );
          }
          if (
            inputValidation.type === 'INVALID_DATA' ||
            inputValidation.type === 'INVALID'
          ) {
            throw new Error(
              `Input validation failed - Event data does not meet contract requirements: ${inputValidation.error.message}`,
            );
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

          const rawMachineEmittedEvents = executionResult.events;

          // In case execution of the machine has finished
          // and the final output has been created, then in
          // that case, make the raw event as the final output
          // is not even raw enough to be called an event yet
          if (executionResult.finalOutput) {
            const _parsedSubject = ArvoOrchestrationSubject.parse(
              event.subject,
            );
            rawMachineEmittedEvents.push({
              type: (
                machine.contracts.self as VersionedArvoContract<
                  ArvoOrchestratorContract,
                  ArvoSemanticVersion
                >
              ).metadata.completeEventType,
              data: executionResult.finalOutput,
              to:
                _parsedSubject?.meta?.redirectto ??
                _parsedSubject.execution.initiator,
            });
          }

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const emittables = rawMachineEmittedEvents.map((item) =>
            this.createEmittableEvent(
              item,
              machine,
              otelHeaders,
              orchestrationParentSubject,
              event,
            ),
          );

          emittables.forEach((item, index) => {
            Object.entries(item.otelAttributes).forEach(([key, value]) => {
              span.setAttribute(`to_emit.${index}.${key}`, value);
            });
          });

          logToSpan({
            level: 'INFO',
            message: `Machine execution completed - Status: ${executionResult.state.status}, Generated events: ${executionResult.events.length}`,
          });

          // Write to the memory
          await this.memory.write(event.subject, {
            subject: event.subject,
            parentSubject: orchestrationParentSubject,
            status: executionResult.state.status,
            value: (executionResult.state as any).value ?? null,
            state: executionResult.state,
          });

          logToSpan({
            level: 'INFO',
            message: `State update persisted in memory for subject ${event.subject}`,
          });

          return emittables;
        } catch (e) {
          logToSpan({
            level: 'ERROR',
            message: `Orchestrator execution failed: ${(e as Error).message}`,
          });
          exceptionToSpan(e as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (e as Error).message,
          });

          // In case of the system error send the event back
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

          const errorEvent = createArvoOrchestratorEventFactory(
            this.registry.machines[0].contracts.self,
          ).systemError({
            source: this.source,
            subject: orchestrationParentSubject ?? event.subject,
            // The system error must always go back to
            // the source with initiated it
            to: parsedEventSubject?.execution.initiator ?? event.source,
            error: e as Error,
            traceparent: otelHeaders.traceparent ?? undefined,
            tracestate: otelHeaders.tracestate ?? undefined,
            accesscontrol: event.accesscontrol ?? undefined,
            executionunits: this.executionunits,
          });
          Object.entries(errorEvent.otelAttributes).forEach(([key, value]) => {
            span.setAttribute(`to_emit.0.${key}`, value);
          });
          return [errorEvent];
        } finally {
          // Finally, if this machine execution session acquired the lock
          // release the lock before closing
          if (this.requiresResourceLocking && thisSessionAcquiredLock) {
            await this.memory.unlock(event.subject).catch((err: Error) => {
              logToSpan(
                {
                  level: 'WARNING',
                  message: `Memory unlock operation failed - Possible resource leak: ${err.message}`,
                },
                span,
              );
            });
          }
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
      type: `sys.${this.source}.error`,
      schema: ArvoErrorSchema,
    };
  }
}
