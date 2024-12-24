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

    state SpanManagement {
        StartExecution --> InitSpan: Create Producer Span
        InitSpan --> SetAttributes: Set Execution Attributes
    }

    state LockAndStateManagement {
        SetAttributes --> AcquireLock
        AcquireLock --> AcquireState: Lock Success
        AcquireLock --> HandleError: Lock Failed
        AcquireState --> ValidateSubject: State Retrieved
        AcquireState --> HandleError: State Read Failed
    }

    state MachineProcessing {
        ValidateSubject --> ResolveMachine: Valid Subject
        ValidateSubject --> HandleError: Invalid Subject Format

        ResolveMachine --> ValidateInput: Machine Resolved
        ValidateInput --> ExecuteMachine: Valid Input
        ValidateInput --> HandleError: Invalid Input
    }

    state EventProcessing {
        ExecuteMachine --> ProcessExecutionResult: Execution Complete
        ProcessExecutionResult --> CreateEmittableEvents: Has Events
        ProcessExecutionResult --> CreateCompleteEvent: Has Final Output

        CreateEmittableEvents --> ValidateEventSchema
        CreateCompleteEvent --> ValidateEventSchema

        ValidateEventSchema --> WriteState: Events Valid
        ValidateEventSchema --> HandleError: Schema Validation Failed
    }

    state ErrorHandling {
        HandleError --> CreateSystemErrorEvent
        CreateSystemErrorEvent --> UnlockResource
    }

    WriteState --> UnlockResource: State Written
    WriteState --> HandleError: Write Failed
    UnlockResource --> [*]

    note right of SpanManagement
        Initializes OpenTelemetry span
        Sets execution attributes
    end note

    note right of LockAndStateManagement
        Handles resource locking
        Retrieves machine state
    end note

    note right of MachineProcessing
        Resolves and validates machine
        Processes input validation
    end note

    note right of EventProcessing
        Processes execution results
        Creates and validates events
        Updates machine state
    end note

    note right of ErrorHandling
        Creates system error events
        Ensures resource cleanup
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
    participant EH as EventHandler

    C->>+O: execute(event, opentelemetry)
    O->>+OT: startActiveSpan()

    O->>+M: lock(event.subject)
    M-->>-O: lock result
    alt Lock Failed
        O-->>C: throw ArvoOrchestratorError
    end

    O->>+M: read(event.subject)
    M-->>-O: state data
    alt State Read Failed
        O-->>C: throw ArvoOrchestratorError
    end

    O->>+R: resolve(event)
    R-->>-O: machine instance

    O->>O: validateInput(event)
    alt Validation Failed
        O-->>C: throw Error
    end

    O->>+E: execute(state, event, machine)
    E-->>-O: execution result

    rect rgb(200, 200, 240)
        Note over O,EH: For each event in result
        loop Process Events
            O->>+EH: createEmittableEvent()
            EH->>EH: validate contract & schema
            EH->>EH: generate subject
            EH-->>-O: ArvoEvent
        end
    end

    O->>+M: write(subject, newState)
    M-->>-O: write confirmation

    alt thisMachineAcquiredLock
        O->>+M: unlock(event.subject)
        M-->>-O: unlock result
        alt Unlock Failed
            Note over O: Log warning
        end
    end

    alt Execution Success
        O-->>C: return emittable events
    else Execution Failed
        O->>O: create system error event
        O-->>C: return error event
    end

    OT->>-O: span.end()
    O-->>-C: complete
```

## Detailed Phase Descriptions

The ArvoOrchestrator execution process begins with span management, where it creates OpenTelemetry producer spans and establishes proper telemetry context. This is followed by the critical lock and state management phase, where it acquires exclusive locks on subjects, retrieves current machine states, and validates subject formats. The machine processing phase then resolves appropriate versions, validates inputs against contracts, and prepares machines for execution.

Once initial setup is complete, the orchestrator moves into event processing, where it executes machine logic, creates and validates emittable events, updates machine states, and handles event routing. Error handling runs parallel to all phases, creating system error events when needed, ensuring proper resource cleanup, maintaining telemetry context, and returning appropriate error responses. The orchestrator implements robust state management through exclusive locking mechanisms, persistent storage, and careful validation.

Throughout the entire process, the orchestrator maintains comprehensive telemetry integration via OpenTelemetry, providing detailed execution attributes and resource usage metrics. It enforces strict schema validation and contract enforcement for all events, generates appropriate subjects, and ensures proper event routing and completion notification. This comprehensive approach ensures reliable state machine orchestration while maintaining observability and proper error handling throughout the execution lifecycle.