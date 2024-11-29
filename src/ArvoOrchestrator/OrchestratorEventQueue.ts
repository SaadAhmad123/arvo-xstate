import {
  ArvoContract,
  ArvoSemanticVersion,
  VersionedArvoContract,
  ArvoOrchestratorContract,
  ArvoEvent,
  ArvoOrchestratorEventTypeGen,
  currentOpenTelemetryHeaders,
  ArvoOrchestrationSubject,
  createArvoEvent,
  createArvoEventFactory,
  exceptionToSpan,
  OpenTelemetryHeaders,
} from 'arvo-core';
import ArvoMachine from '../ArvoMachine';
import { AnyActorLogic } from 'xstate';
import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { EnqueueArvoEventActionParam } from '../ArvoMachine/types';

/**
 * Manages a queue of Arvo events and error events for an orchestrator.
 * Handles event creation, validation, and error handling with contract enforcement.
 */
export class OrchestratorEventQueue {
  private readonly _events: ArvoEvent[] = [];

  /** Get all queued events */
  public get events() {
    return this._events;
  }

  private readonly _errorEvents: ArvoEvent[] = [];

  /** Get all error events that occurred during event processing */
  public get errorEvents() {
    return this._errorEvents;
  }

  constructor(
    private readonly param: {
      machines: Record<
        ArvoSemanticVersion,
        ArvoMachine<
          string,
          ArvoSemanticVersion,
          VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>,
          Record<
            string,
            VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
          >,
          AnyActorLogic
        >
      >;
      sourceEvent: ArvoEvent;
      parentSubject: string | null;
      sourceName: string;
      executionunits?: number;
      otelTracer?: Tracer;
      otelSpanHeaders: OpenTelemetryHeaders;
    },
  ) {}

  /**
   * Creates a new Arvo event with the provided parameters and current context
   * @param param Event creation parameters
   * @returns Newly created ArvoEvent
   * @private
   */
  private createEvent(param: EnqueueArvoEventActionParam): ArvoEvent {
    const { __extensions, ...eventData } = param;
    return createArvoEvent(
      {
        ...eventData,
        traceparent: this.param.otelSpanHeaders.traceparent ?? undefined,
        tracestate: this.param.otelSpanHeaders.tracestate ?? undefined,
        source: this.param.sourceName,
        subject: eventData.subject ?? this.param.sourceEvent.subject,
        to: eventData.to ?? eventData.type,
        redirectto: eventData.redirectto ?? undefined,
        executionunits: eventData.executionunits ?? this.param.executionunits,
        accesscontrol:
          eventData.accesscontrol ??
          this.param.sourceEvent.accesscontrol ??
          undefined,
      },
      __extensions,
      {
        disable: false,
        tracer: this.param.otelTracer,
      },
    );
  }

  /**
   * Retrieves the contract associated with an event type for a given version
   * @param version Semantic version to look up
   * @param param Event parameters containing the type to look up
   * @returns The contract if found, undefined otherwise
   * @private
   */
  private getEventContract(
    version: ArvoSemanticVersion,
    param: EnqueueArvoEventActionParam,
  ) {
    const eventContract:
      | VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
      | undefined = Object.values(
      this.param.machines[version].contracts.services,
    ).filter((item) => item.accepts.type === param.type)[0];
    return eventContract;
  }

  /**
   * Creates a subject identifier for an orchestrator event
   * @param contract The contract associated with the event
   * @param param Event parameters
   * @returns Generated subject identifier string
   * @throws Error if parentSubject$$ is not provided in the event data
   * @private
   */
  private createOrchestratorSubject(
    contract: VersionedArvoContract<ArvoContract, ArvoSemanticVersion>,
    param: EnqueueArvoEventActionParam,
    sourceName: string,
  ): string {
    const parentSubject: string | undefined | null =
      param?.data?.parentSubject$$;
    let subject: string;
    if (parentSubject) {
      subject = ArvoOrchestrationSubject.from({
        subject: parentSubject,
        orchestator: contract.accepts.type,
        version: contract.version,
      });
    } else {
      subject = ArvoOrchestrationSubject.new({
        version: contract.version,
        orchestator: contract.accepts.type,
        initiator: sourceName,
      });
    }
    return param.subject ?? subject;
  }

  /**
   * Adds a new event to the queue with optional contract validation
   * @param version Semantic version of the event
   * @param param Event parameters
   * @param strict Whether to enforce strict contract validation (default: true)
   * @returns Length of the events array after adding the new event
   * @throws Error if contract validation fails in strict mode
   */
  public appendEvent(
    version: ArvoSemanticVersion,
    param: EnqueueArvoEventActionParam,
    strict: boolean = true,
  ) {
    try {
      if (!strict) {
        return this._events.push(this.createEvent(param));
      }
      const contract = this.getEventContract(version, param);
      if (!contract) {
        throw new Error(
          `The emitted event (type=${param.type}) does not correspond to a contract. If this is delibrate, the use the action 'enqueueArvoEvent' instead of the 'emit'`,
        );
      }
      const contractualDataSchema = `${contract.uri}/${contract.version}`;
      let dataschema = param.dataschema ?? contractualDataSchema;
      if (dataschema !== contractualDataSchema) {
        throw new Error(
          `The dataschema of the event to be emitted (dataschema=${dataschema}) does not match the dataschema imposed by the contract (uri=${contract.uri}, version=${contract.version})`,
        );
      }
      const isOrchestrator = param.type.startsWith(
        ArvoOrchestratorEventTypeGen.prefix,
      );
      return this._events.push(
        this.createEvent({
          ...param,
          subject: isOrchestrator
            ? this.createOrchestratorSubject(
                contract,
                param,
                this.param.sourceName,
              )
            : param.subject,
          data: contract.accepts.schema.parse(param.data),
          dataschema: dataschema,
        }),
      );
    } catch (e) {
      return this.appendError(e as Error);
    }
  }

  /**
   * Adds an error event to the error queue
   * @param error The error to be added
   * @returns Length of the error events array after adding the new error
   */
  public appendError(error: Error) {
    const otelSpanHeaders = currentOpenTelemetryHeaders();
    exceptionToSpan(error);
    trace.getActiveSpan()?.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    const _event = createArvoEventFactory(
      Object.values(this.param.machines)[0].contracts.self,
    ).systemError({
      source: this.param.sourceName,
      subject: this.param.parentSubject ?? this.param.sourceEvent.subject,
      // The system error must always go back to
      // the source with initiated it
      to: this.param.sourceEvent.source,
      error: error,
      executionunits: this.param.executionunits,
      traceparent: otelSpanHeaders.traceparent ?? undefined,
      tracestate: otelSpanHeaders.tracestate ?? undefined,
      accesscontrol: this.param.sourceEvent.accesscontrol ?? undefined,
    });
    return this._errorEvents.push(_event);
  }
}
