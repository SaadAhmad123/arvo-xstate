import { z } from 'zod';
import {
  ArvoOrchestratorExecuteInput,
  ArvoOrchestratorExecuteOutput,
  IArvoOrchestrator,
} from './types';
import {
  ArvoContract,
  ArvoContractRecord,
  ArvoExecutionSpanKind,
  ArvoOrchestrationSubject,
  ArvoOrchestratorContract,
  ArvoSemanticVersion,
  currentOpenTelemetryHeaders,
  OpenInferenceSpanKind,
  VersionedArvoContract,
} from 'arvo-core';
import { Actor, AnyActorLogic, createActor, Snapshot } from 'xstate';
import ArvoMachine from '../ArvoMachine';
import { createOtelSpan } from 'arvo-event-handler';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { base64ToObject, findLatestVersion, objectToBase64 } from './utils';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { XStatePersistanceSchema } from './schema';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';
import { OrchestratorEventQueue } from './OrchestratorEventQueue';

/**
 * ArvoOrchestrator manages versioned workflow execution in distributed environments.
 * It coordinates multiple ArvoMachines, handles event routing, and maintains state
 * across executions while providing OpenTelemetry instrumentation.
 *
 * @template TSelfContract - Contract type defining orchestrator capabilities and versions
 *                          Must extend ArvoOrchestratorContract
 *
 * Key capabilities:
 * - Version management across different workflow implementations
 * - State persistence and restoration
 * - Event routing and validation
 * - Error handling and reporting
 * - Telemetry and monitoring integration
 * - Resource usage control
 *
 * @example
 * ```typescript
 * const orchestrator = new ArvoOrchestrator({
 *   contract: myOrchestratorContract,
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

    return context.with(
      trace.setSpan(context.active(), span),
      (): ArvoOrchestratorExecuteOutput => {
        Object.entries(event.otelAttributes).forEach(([key, value]) =>
          span.setAttribute(`to_process.0.${key}`, value),
        );

        const eventQueue = new OrchestratorEventQueue({
          machines: this.machines,
          sourceEvent: event,
          parentSubject: parentSubject,
          sourceName: this.source,
          executionunits: this.executionunits,
          otelTracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer(),
          otelSpanHeaders: currentOpenTelemetryHeaders(),
        });

        let snapshot: Snapshot<any> | null = null;
        let compressedSnapshot: string | null = null;

        try {
          // Validate event destination
          if (event.to !== this.source) {
            throw new Error(
              `Invalid event destination: The event's 'to' field (${event.to}) does not match the orchestrator's source (${this.source}). Please ensure the event is directed to the correct orchestrator.`,
            );
          }

          // Vaidate and parse the subject
          const parsedSubject = ArvoOrchestrationSubject.parse(event.subject);
          if (parsedSubject.orchestrator.name !== this.source) {
            throw new Error(
              `Invalid event subject: The orchestrator name in the parsed subject (${parsedSubject.orchestrator.name}) does not match the expected source (${this.source}). Please verify the event originator's configuration.`,
            );
          }

          // Select the machine version required to use based on the parsed subject
          let versionToUse: ArvoSemanticVersion =
            parsedSubject.orchestrator.version;
          if (
            versionToUse === ArvoOrchestrationSubject.WildCardMachineVersion
          ) {
            versionToUse = findLatestVersion(
              Object.values(this.machines).map((item) => item.version),
            );
          }

          // Select the machine
          const machine = this.machines[versionToUse];
          if (!machine) {
            throw new Error(
              `Unsupported version: No machine found for orchestrator ${this.source} with version '${parsedSubject.orchestrator.version}'. Please check the supported versions and update your request.`,
            );
          }

          // Actor creation and process with or without the state
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
            actor.on('*', (event: EnqueueArvoEventActionParam) =>
              eventQueue.appendEvent(versionToUse, event, true),
            );
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
            actor.on('*', (event: EnqueueArvoEventActionParam) =>
              eventQueue.appendEvent(versionToUse, event, true),
            );
            // With this the errors are not leaked anymore
            actor.subscribe({ error: () => {} });
            actor.send(event.toJSON() as any);
          }

          // Creating the snapshot
          snapshot = actor.getPersistedSnapshot();
          if ((snapshot as any)?.context?.arvo$$?.volatile$$) {
            (
              (snapshot as any)?.context?.arvo$$?.volatile$$
                ?.eventQueue$$ as EnqueueArvoEventActionParam[]
            ).forEach((item) =>
              eventQueue.appendEvent(versionToUse, item, false),
            );
            delete (snapshot as any).context.arvo$$.volatile$$;
          }

          // Emitting the orchestrator output if the process is done
          if (snapshot.output) {
            eventQueue.appendEvent(
              versionToUse,
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

          // Raise the error in case the snapshot has error in it
          if (snapshot.error) {
            throw snapshot.error;
          }

          // Compressed state generation
          compressedSnapshot = objectToBase64(
            XStatePersistanceSchema,
            snapshot as any,
          );
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          eventQueue.appendError(error as Error);
        }
        const isError = eventQueue.errorEvents.length > 0;
        const results = isError ? eventQueue.errorEvents : eventQueue.events;
        results.forEach((item) =>
          Object.entries(item.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_emit.0.${key}`, value),
          ),
        );
        span.end();

        if (isError) {
          return {
            executionStatus: 'error',
            events: results,
            state: null,
            snapshot: null,
            subject: event.subject,
            parentSubject: parentSubject,
          };
        }
        return {
          executionStatus: 'success',
          events: results,
          state: compressedSnapshot,
          snapshot: snapshot as z.infer<typeof XStatePersistanceSchema>,
          subject: event.subject,
          parentSubject: parentSubject,
        };
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
