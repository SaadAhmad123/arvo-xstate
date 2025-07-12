// import { context, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
// import {
//   ArvoExecution,
//   ArvoExecutionSpanKind,
//   ArvoOpenTelemetry,
//   ArvoOrchestrationSubject,
//   type ArvoOrchestrationSubjectContent,
//   createArvoOrchestratorEventFactory,
//   currentOpenTelemetryHeaders,
//   exceptionToSpan,
//   logToSpan,
//   OpenInference,
//   OpenInferenceSpanKind,
//   type ViolationError,
//   type ArvoEvent,
//   type ArvoOrchestratorContract,
//   type VersionedArvoContract,
//   EventDataschemaUtil,
//   isWildCardArvoSematicVersion,
// } from 'arvo-core';
// import {
//   AbstractArvoEventHandler,
//   ConfigViolation,
//   ExecutionViolation,
//   type ArvoEventHandlerOpenTelemetryOptions,
// } from 'arvo-event-handler';
// //import { TransactionViolation, TransactionViolationCause, type IMachineMemory } from 'arvo-xstate';
// import type { z } from 'zod';
// import type { ArvoResumableHandler, ArvoResumableState } from './types.js';
// import { isError } from '../utils/index.js';
// import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrator/error.js';
// import type { IMachineMemory } from '../MachineMemory/interface.js';

// export type AcquiredLockStatusType = 'NOOP' | 'ACQUIRED' | 'NOT_ACQUIRED';

// export class ArvoResumableFunction<
//   TMemory extends Record<string, any>,
//   TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
//   TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
//     string,
//     VersionedArvoContract<any, any>
//   >,
// > extends AbstractArvoEventHandler {
//   readonly executionunits: number;
//   readonly memory: IMachineMemory<ArvoResumableState<TMemory>>;
//   readonly requiresResourceLocking: boolean;
//   readonly source: string;
//   readonly contracts: {
//     self: TSelfContract;
//     services: TServiceContract;
//   };

//   constructor(param: {
//     contracts: {
//       self: TSelfContract;
//       services: TServiceContract;
//     };
//     executionunits: number;
//     memory: IMachineMemory<TMemory>;
//     requiresResourceLocking?: boolean;
//     handler: ArvoResumableHandler<TMemory, TSelfContract, TServiceContract>;
//   }) {
//     super();
//     this.executionunits = param.executionunits;
//     this.source = param.contracts.self.type;
//     this.memory = param.memory;
//     this.requiresResourceLocking = param.requiresResourceLocking ?? true;
//     this.contracts = param.contracts;
//   }

//   protected validateConsumedEventSubject(event: ArvoEvent) {
//     logToSpan({
//       level: 'INFO',
//       message: 'Validating event subject',
//     });
//     const isValid = ArvoOrchestrationSubject.isValid(event.subject);
//     if (!isValid) {
//       throw new ExecutionViolation(
//         `Invalid event (id=${event.id}) subject format. Expected an ArvoOrchestrationSubject but received '${event.subject}'. The subject must follow the format specified by ArvoOrchestrationSubject schema`,
//       );
//     }
//   }

//   /**
//    * Acquires a lock on the event subject. Skip if sequential processing is enabled.
//    * @throws {TransactionViolation} If lock acquisition fails
//    */
//   protected async acquireLock(event: ArvoEvent): Promise<AcquiredLockStatusType> {
//     const id: string = event.subject;
//     if (!this.requiresResourceLocking) {
//       logToSpan({
//         level: 'INFO',
//         message: `Skipping acquiring lock for event (id=${id}) as the resumable function explicitly enables it.`,
//       });
//       return 'NOOP';
//     }

//     try {
//       logToSpan({
//         level: 'INFO',
//         message: 'Acquiring lock for the event',
//       });
//       const acquired = await this.memory.lock(id);
//       return acquired ? 'ACQUIRED' : 'NOT_ACQUIRED';
//     } catch (e) {
//       throw new TransactionViolation({
//         cause: TransactionViolationCause.LOCK_FAILURE,
//         message: `Error acquiring lock (id=${id}): ${(e as Error)?.message}`,
//         initiatingEvent: event,
//       });
//     }
//   }

//   /**
//    * If the machine execution session acquired the lock
//    * release the lock before closing. Since the expectation from the
//    * machine memory is that there is optimistic locking and the lock
//    * has expiry time then swallowing is not an issue rather it
//    * avoid unnecessary errors
//    */
//   protected async releaseLock(
//     event: ArvoEvent,
//     acquiredLock: AcquiredLockStatusType | null,
//     span: Span,
//   ): Promise<'NOOP' | 'RELEASED' | 'ERROR'> {
//     if (acquiredLock !== 'ACQUIRED') {
//       logToSpan(
//         {
//           level: 'INFO',
//           message: 'Lock was not acquired by the process so perfroming no operation',
//         },
//         span,
//       );
//       return 'NOOP';
//     }
//     try {
//       await this.memory.unlock(event.subject);
//       logToSpan(
//         {
//           level: 'INFO',
//           message: 'Lock successfully released',
//         },
//         span,
//       );
//       return 'RELEASED';
//     } catch (err) {
//       logToSpan(
//         {
//           level: 'ERROR',
//           message: `Memory unlock operation failed - Possible resource leak: ${(err as Error).message}`,
//         },
//         span,
//       );
//       return 'ERROR';
//     }
//   }

//   protected async acquireState(event: ArvoEvent): Promise<TMemory | null> {
//     const id: string = event.subject;
//     try {
//       logToSpan({
//         level: 'INFO',
//         message: 'Reading resumable function state for the event',
//       });
//       return await this.memory.read(id);
//     } catch (e) {
//       throw new TransactionViolation({
//         cause: TransactionViolationCause.READ_FAILURE,
//         message: `Error reading state (id=${id}): ${(e as Error)?.message}`,
//         initiatingEvent: event,
//       });
//     }
//   }

//   protected async persistState(event: ArvoEvent, record: TMemory, prevRecord: TMemory | null) {
//     const id = event.subject;
//     try {
//       logToSpan({
//         level: 'INFO',
//         message: 'Persisting resumable function state to the storage',
//       });
//       await this.memory.write(id, record, prevRecord);
//     } catch (e) {
//       throw new TransactionViolation({
//         cause: TransactionViolationCause.WRITE_FAILURE,
//         message: `Error writing state for event (id=${id}): ${(e as Error)?.message}`,
//         initiatingEvent: event,
//       });
//     }
//   }

//   protected validateInput(event: ArvoEvent) {
//     // biome-ignore lint/suspicious/noExplicitAny: <explanation>
//     let resovledContract: VersionedArvoContract<any, any> | null = null;
//     let contractType: 'self' | 'service';

//     const parsedEventDataSchema = EventDataschemaUtil.parse(event);
//     if (!parsedEventDataSchema) {
//       throw new ExecutionViolation(
//         `Event dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}'). This makes the event opaque and does not allow contract resolution`,
//       );
//     }

//     if (event.type === this.contracts.self.type) {
//       contractType = 'self';
//       resovledContract = this.contracts.self.version(parsedEventDataSchema.version);
//     } else {
//       contractType = 'service';
//       for (const contract of Object.values(this.contracts.services)) {
//         if (resovledContract) break;
//         for (const emitType of [...contract.emitList, contract.systemError]) {
//           if (resovledContract) break;
//           if (event.type === emitType) {
//             resovledContract = contract;
//           }
//         }
//       }
//     }

//     if (!resovledContract) {
//       throw new ConfigViolation(
//         `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`,
//       );
//     }

//     logToSpan({
//       level: 'INFO',
//       message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resovledContract.uri}', version='${resovledContract.version}')`,
//     });
//     if (parsedEventDataSchema.uri !== resovledContract.uri) {
//       throw new Error(
//         `Contract URI mismatch: ${contractType} Contract(uri='${resovledContract.uri}', type='${resovledContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
//       );
//     }
//     if (
//       !isWildCardArvoSematicVersion(parsedEventDataSchema.version) &&
//       parsedEventDataSchema.version !== resovledContract.version
//     ) {
//       throw new Error(
//         `Contract version mismatch: ${contractType} Contract(version='${resovledContract.version}', type='${resovledContract.accepts.type}', uri=${resovledContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
//       );
//     }

//     const validationSchema: z.AnyZodObject =
//       contractType === 'self'
//         ? resovledContract.accepts.schema
//         : (resovledContract.emits[event.type] ?? resovledContract.systemError.schema);

//     validationSchema.parse(event.data);
//   }

//   async execute(
//     event: ArvoEvent,
//     opentelemetry: ArvoEventHandlerOpenTelemetryOptions,
//   ): Promise<{ events: ArvoEvent[] }> {
//     const result = ArvoOpenTelemetry.getInstance().startActiveSpan({
//       name: `Resumable<${this.contracts.self.uri}>@<${event.type}>`,
//       spanOptions: {
//         kind: SpanKind.PRODUCER,
//         attributes: {
//           [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
//           [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
//           ...Object.fromEntries(
//             Object.entries(event.otelAttributes).map(([key, value]) => [`to_process.0.${key}`, value]),
//           ),
//         },
//       },
//       context:
//         opentelemetry.inheritFrom === 'EVENT'
//           ? {
//               inheritFrom: 'TRACE_HEADERS',
//               traceHeaders: {
//                 traceparent: event.traceparent,
//                 tracestate: event.tracestate,
//               },
//             }
//           : {
//               inheritFrom: 'CONTEXT',
//               context: context.active(),
//             },
//       disableSpanManagement: true,
//       fn: async (span) => {
//         logToSpan({
//           level: 'INFO',
//           message: `Resumable function starting execution for ${event.type} on subject ${event.subject}`,
//         });
//         const otelHeaders = currentOpenTelemetryHeaders();
//         let orchestrationParentSubject: string | null = null;
//         let acquiredLock: AcquiredLockStatusType | null = null;

//         try {
//           this.validateConsumedEventSubject(event);

//           // Acquiring lock
//           acquiredLock = await this.acquireLock(event);

//           if (acquiredLock === 'NOT_ACQUIRED') {
//             throw new TransactionViolation({
//               cause: TransactionViolationCause.LOCK_UNACQUIRED,
//               message: 'Lock acquisition denied - Unable to obtain exclusive access to event processing',
//               initiatingEvent: event,
//             });
//           }

//           if (acquiredLock === 'ACQUIRED') {
//             logToSpan({
//               level: 'INFO',
//               message: `This execution acquired lock at resource '${event.subject}'`,
//             });
//           }

//           // Acquiring state
//           const state = await this.acquireState(event);
//           orchestrationParentSubject = state?.parentSubject ?? null;

//           if (!state) {
//             logToSpan({
//               level: 'INFO',
//               message: `Initializing new execution state for subject: ${event.subject}`,
//             });

//             if (event.type !== this.source) {
//               logToSpan({
//                 level: 'WARNING',
//                 message: `Invalid initialization event detected. Expected type '${this.source}' but received '${event.type}'. This may indicate an incorrectly routed event or a non-initialization event that can be safely ignored.`,
//               });
//               logToSpan({
//                 level: 'INFO',
//                 message: 'Orchestration executed with issues and emitted 0 events',
//               });

//               return {
//                 events: [],
//                 allEventDomains: [],
//                 domainedEvents: {
//                   all: [],
//                 },
//               };
//             }
//           } else {
//             logToSpan({
//               level: 'INFO',
//               message: `Resuming execution with existing state for subject: ${event.subject}`,
//             });

//             if (ArvoOrchestrationSubject.parse(event.subject).orchestrator.name !== this.source) {
//               logToSpan({
//                 level: 'WARNING',
//                 message: `Event subject mismatch detected. Expected orchestrator '${this.source}' but subject indicates '${ArvoOrchestrationSubject.parse(event.subject).orchestrator.name}'. This indicates either a routing error or a non-applicable event that can be safely ignored.`,
//               });

//               logToSpan({
//                 level: 'INFO',
//                 message: 'Orchestration executed with issues and emitted 0 events',
//               });
//               return {
//                 events: [],
//                 allEventDomains: [],
//                 domainedEvents: {
//                   all: [],
//                 },
//               };
//             }
//           }

//           // In case the event is the init event then
//           // extract the parent subject from it and assume
//           // it to be the orchestration parent subject
//           if (event.type === this.source) {
//             orchestrationParentSubject = event?.data?.parentSubject$$ ?? null;
//           }

//           logToSpan({
//             level: 'INFO',
//             message: `Input validation started for event ${event.type}`,
//           });

//           this.validateInput(event);
//         } catch (error: unknown) {
//           // If this is not an error this is not exected and must be addressed
//           // This is a fundmental unexpected scenario and must be handled as such
//           // What this show is the there is a non-error object being throw in the
//           // implementation or execution of the machine which is a major NodeJS
//           // violation
//           const e: Error = isError(error)
//             ? error
//             : new ExecutionViolation(
//                 `Non-Error object thrown during machine execution: ${typeof error}. This indicates a serious implementation flaw.`,
//               );
//           exceptionToSpan(e);
//           span.setStatus({
//             code: SpanStatusCode.ERROR,
//             message: e.message,
//           });

//           // For any violation errors bubble them up to the
//           // called of the function so that they can
//           // be handled gracefully
//           if ((e as ViolationError).name.includes('ViolationError')) {
//             logToSpan({
//               level: 'CRITICAL',
//               message: `Orchestrator violation error: ${e.message}`,
//             });
//             throw e;
//           }

//           logToSpan({
//             level: 'ERROR',
//             message: `Orchestrator execution failed: ${e.message}`,
//           });

//           // In case of none transaction errors like errors from
//           // the machine or the event creation etc, the are workflow
//           // error and shuold be handled by the workflow. Then are
//           // called system error and must be sent
//           // to the initiator. In as good of a format as possible
//           let parsedEventSubject: ArvoOrchestrationSubjectContent | null = null;
//           try {
//             parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
//           } catch (e) {
//             logToSpan({
//               level: 'WARNING',
//               message: `Unable to parse event subject: ${(e as Error).message}`,
//             });
//           }

//           const errorEvent = createArvoOrchestratorEventFactory(this.contracts.self.version('any')).systemError({
//             source: this.source,
//             // If the initiator of the workflow exist then match the
//             // subject so that it can incorporate it in its state. If
//             // parent does not exist then this is the root workflow so
//             // use its own subject
//             subject: orchestrationParentSubject ?? event.subject,
//             // The system error must always go back to
//             // the source which initiated it
//             to: parsedEventSubject?.execution.initiator ?? event.source,
//             error: e,
//             traceparent: otelHeaders.traceparent ?? undefined,
//             tracestate: otelHeaders.tracestate ?? undefined,
//             accesscontrol: event.accesscontrol ?? undefined,
//             executionunits: this.executionunits,
//             // @ts-ignore
//             parentid: event.id,
//           });
//           // biome-ignore lint/complexity/noForEach: non issue
//           Object.entries(errorEvent.otelAttributes).forEach(([key, value]) => {
//             span.setAttribute(`to_emit.0.${key}`, value);
//           });
//           return {
//             events: [errorEvent],
//             allEventDomains: ['default'],
//             domainedEvents: {
//               all: [errorEvent],
//               default: [errorEvent],
//             },
//           };
//         } finally {
//           await this.releaseLock(event, acquiredLock, span);
//           span.end();
//         }
//       },
//     });

//     return { events: [] as ArvoEvent[] };
//   }

//   get systemErrorSchema() {
//     return this.contracts.self.systemError;
//   }
// }
