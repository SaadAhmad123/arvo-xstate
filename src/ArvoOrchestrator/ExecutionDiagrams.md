# ArvoOrchestrator Technical Documentation

The ArvoOrchestrator is a critical component that orchestrates state machine execution and lifecycle management. It handles machine resolution, state management, event processing, and error handling while maintaining comprehensive telemetry through OpenTelemetry integration.

## Core Responsibilities

The orchestrator manages several key aspects:

1. State machine lifecycle management
2. Lock acquisition and state management
3. Event validation and processing
4. Machine resolution and execution
5. Error handling and cleanup
6. Event emission and routing

## Execution Flow

The state diagram below illustrates the core execution flow:

```mermaid
stateDiagram-v2
    [*] --> StartExecution
    StartExecution --> InitSpan: Create Producer Span
    InitSpan --> ValidateSubject: Configure OTEL

    ValidateSubject --> CheckLocking: Valid Subject
    ValidateSubject --> HandleTransactionError: Invalid Subject
    note right of ValidateSubject
      Log Validating event subject
    end note

    CheckLocking --> AttemptLock: Requires Lock
    CheckLocking --> SkipLock: Sequential Machine
    note right of CheckLocking
      Log Skipping lock for sequential machine
    end note

    AttemptLock --> LockAcquired: Success
    AttemptLock --> HandleTransactionError: Failure
    note right of AttemptLock
      Log Acquiring lock for event
    end note

    LockAcquired --> ReadState
    SkipLock --> ReadState
    note right of LockAcquired
      Log Lock acquired at resource
    end note

    ReadState --> StateValidation: Success
    ReadState --> HandleTransactionError: Failure
    note right of ReadState
      Log Reading machine state
    end note

    StateValidation --> InitialStateCheck

    InitialStateCheck --> ValidateInitEvent: No State
    InitialStateCheck --> ValidateOrchestrator: Has State
    note right of InitialStateCheck
      Log Initializing/Resuming state
    end note

    ValidateInitEvent --> ResolveMachine: Source Match
    ValidateInitEvent --> EmitEmpty: Init event type not match orchestrator source
    note right of ValidateInitEvent
      A list of logs:
      - Log Invalid initialization event in case of mismatch
      - Log Orchestration finished with issue and 0 events
    end note

    ValidateOrchestrator --> ResolveMachine: Match
    ValidateOrchestrator --> EmitEmpty: The non emit event subject is not valid
    note right of ValidateOrchestrator
      A list of logs:
      - Log Event subject mismatch
      - Log Orchestration finished with issue and 0 events
    end note

    ResolveMachine --> ValidateInput: Machine resolved from registry to handle the event
    ResolveMachine --> HandleSystemError: Failure to resolve machine will generate system error
    note right of ResolveMachine
      Log Resolving machine for event
    end note

    ValidateInput --> ExecuteMachine: Valid Data as per one of machine contracts
    ValidateInput --> HandleSystemError: Cannot resolve contract required by the event.type for its validation
    ValidateInput --> HandleSystemError: Invalid data as per all machine contracts
    ValidateInput --> HandleSystemError: Invalid event contract as per the event.dataschema
    note right of ValidateInput
      Does the following: 
      - From the resolved machine this validates if the event is expected by the machine 
      - Log Input validation started
    end note

    ExecuteMachine --> CheckOutput: Machine Executed
    ExecuteMachine --> HandleSystemError: Error in machine execution
    note right of ExecuteMachine
      Log Machine execution completed
    end note

    CheckOutput --> ProcessRawEvents: Has Events
    CheckOutput --> ProcessFinalOutput: Has Final Output
    note right of CheckOutput
      Log Processing execution result
    end note

    ProcessRawEvents --> CreateEmittableEvents
    ProcessFinalOutput --> CreateEmittableEvents
    note right of ProcessRawEvents
      Log Creating emittable events
    end note

    CreateEmittableEvents --> ValidateEmittables
    note right of CreateEmittableEvents
      Log Event created successfully
    end note

    ValidateEmittables --> PersistState: Valid Events
    ValidateEmittables --> HandleSystemError: Invalid Events
    note right of ValidateEmittables
      Log Event data validation
    end note

    PersistState --> Cleanup: Success
    PersistState --> HandleTransactionError: Failure
    note right of PersistState
      Log Persisting machine state
    end note

    HandleTransactionError --> Cleanup
    note right of HandleTransactionError
      Log CRITICAL Transaction failed
    end note

    HandleSystemError --> CreateErrorEvent
    note right of HandleSystemError
      Log ERROR Execution failed
    end note

    CreateErrorEvent --> Cleanup
    EmitEmpty --> Cleanup

    Cleanup --> ReleaseLock: Has Lock
    Cleanup --> EndSpan: No Lock
    note right of Cleanup Log State update persisted

    ReleaseLock --> EndSpan
    note right of ReleaseLock
      Log WARNING if unlock fails
    end note

    EndSpan --> EmitEvent: Emit events generated by the machine execution
    note right of EndSpan
      Log Orchestration complete
    end note

    note left of HandleTransactionError
        Transaction errors are bubbled up
        System errors create error events
    end note
```

## Component Interactions

The sequence diagram below shows the detailed interactions between components:

```mermaid
sequenceDiagram
    participant C as Client
    participant O as ArvoOrchestrator
    participant OT as OpenTelemetry
    participant M as MachineMemory
    participant R as MachineRegistry
    participant E as ExecutionEngine
    participant SM as State Machine

    C->>+O: execute(event, opentelemetry)
    O->>+OT: startActiveSpan()
    OT-->>O: span context

    O->>O: validateConsumedEventSubject()
    O->>OT: logToSpan(INFO)

    alt requiresResourceLocking is true
        O->>+M: lock(event.subject)
        M-->>O: throw ArvoTransactionError on lock failure
        M-->>O: throw ArvoTransactionError on lock not acquired
        M->>-O: Lock successfully acquired
    else ELSE
        O->>OT: logToSpan(INFO, "Skipping lock")
    end

    O->>+M: read(event.subject)
    M-->>O: throw ArvoTransactionError on read failure
    M->>-O: state data

    alt No State Found
        O->>OT: logToSpan(INFO, "Initializing new state")
        alt event.type !== source
            O->>OT: logToSpan(WARNING)
            O->>OT: logToSpan(INFO, "Orchestration ended with issues")
            O-->>C: return []
        end
    else Has State
        O->>OT: logToSpan(INFO, "Resuming execution")
        alt Orchestrator Mismatch
            O->>OT: logToSpan(WARNING)
            O->>OT: logToSpan(INFO, "Orchestration ended with issues")
            O-->>C: return []
        end
    end

    O->>+R: Resolve machine from registry based on event
    R-->>O: throw system error on machine registry issues
    R-->>-O: ArvoMachine
    O->>OT: logToSpan(INFO, "Machine resolved")

    O->>SM: machine.validateInput(event)
    SM->>O: Valiation result
    alt Invalid
       O-->>O: raise system error
    end
    

    O->>+SM: machine.execute(state, event, machine)
    SM-->O: throw system error on execution issues
    SM->>-O: executionResult

    O->>OT: setAttribute('arvo.orchestrator.status', machine status)

    rect rgb(240, 240, 240)
        Note over O: Process Results
        O->>O: Process rawMachineEmittedEvents
        alt Has Final Output
            O->>O: Add completion event
        end
        loop For Each Event
            O->>O: createEmittableEvent()
            O->>OT: logToSpan(INFO)
        end
    end

    O->>+M: write(subject, newState, prevState)
    M-->>O: throw ArvoTransactionError on write failure
    M->>-O: write result

    alt Any Error During Processing
        O->>OT: exceptionToSpan()
        O->>OT: setStatus(ERROR)
        alt Is TransactionError
            O->>OT: logToSpan(CRITICAL)
            O-->>C: throw ArvoTransactionError
        else Is SystemError
            O->>OT: logToSpan(ERROR)
            O->>O: createSystemErrorEvent()
            O-->>C: return [errorEvent]
        end
    end

    alt Lock Was Acquired
        O->>+M: unlock(event.subject)
        M-->>-O: unlock result
        alt Unlock Failed
            O->>OT: logToSpan(WARNING)
        end
    end

    O->>OT: span.end()
    OT-->>-O: complete
    O-->>-C: return emittableEvents
```

## Detailed Phase Descriptions

The ArvoOrchestrator execution process begins with span management, where it creates OpenTelemetry producer spans and establishes proper telemetry context. This is followed by the critical lock and state management phase, where it acquires exclusive locks on subjects, retrieves current machine states, and validates subject formats. The machine processing phase then resolves appropriate versions, validates inputs against contracts, and prepares machines for execution.

Once initial setup is complete, the orchestrator moves into event processing, where it executes machine logic, creates and validates emittable events, updates machine states, and handles event routing. Error handling runs parallel to all phases, creating system error events when needed, ensuring proper resource cleanup, maintaining telemetry context, and returning appropriate error responses. The orchestrator implements robust state management through exclusive locking mechanisms, persistent storage, and careful validation.

Throughout the entire process, the orchestrator maintains comprehensive telemetry integration via OpenTelemetry, providing detailed execution attributes and resource usage metrics. It enforces strict schema validation and contract enforcement for all events, generates appropriate subjects, and ensures proper event routing and completion notification. This comprehensive approach ensures reliable state machine orchestration while maintaining observability and proper error handling throughout the execution lifecycle.
