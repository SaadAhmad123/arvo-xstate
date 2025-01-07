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
        InitSpan --> SetAttributes: Configure OTEL
        SetAttributes --> CheckLockingRequired
    }

    state LockAndStateManagement {

        state CheckLockingRequired {
            [*] --> RequiresLocking: requiresResourceLocking=true
            [*] --> SkipLocking: requiresResourceLocking=false
        }
        SkipLocking --> AcquireState: Skip Lock

        AcquireLock --> AcquireState: Lock Success
        AcquireLock --> HandleError: Lock Failed
        AcquireState --> StateValidation: State Retrieved
        AcquireState --> HandleError: State Read Failed
    }

    state StateValidation {
        ValidateState --> NewExecution: No State
        ValidateState --> ExistingExecution: Has State

        state NewExecution {
            [*] --> ValidateInitEvent
            ValidateInitEvent --> InitSuccess: Source Type Match
            ValidateInitEvent --> CleanupResources: Type Mismatch
        }

        state ExistingExecution {
            [*] --> ValidateOrchestratorMatch
            ValidateOrchestratorMatch --> ResumeSuccess: Match
            ValidateOrchestratorMatch --> CleanupResources: Mismatch
        }
    }

    state MachineProcessing {
        InitSuccess --> ResolveMachine
        ResumeSuccess --> ResolveMachine
        ResolveMachine --> ValidateInput: Machine Resolved
        ValidateInput --> ExecuteMachine: Valid Input
        ValidateInput --> HandleError: Invalid Input
    }

    state EventProcessing {
        ExecuteMachine --> ProcessResult: Execution Complete
        ProcessResult --> HandleRawEvents: Has Events
        ProcessResult --> CreateCompleteEvent: Has Final Output
        HandleRawEvents --> CreateEmittableEvents
        CreateCompleteEvent --> CreateEmittableEvents
        CreateEmittableEvents --> ValidateEvents
        ValidateEvents --> WriteState: Valid
        ValidateEvents --> HandleError: Invalid
    }

    state ErrorHandling {
        HandleError --> CreateSystemErrorEvent
        CreateSystemErrorEvent --> CleanupResources
    }

    WriteState --> CleanupResources: State Written
    WriteState --> HandleError: Write Failed
    CleanupResources --> [*]
    IgnoreEvent --> CleanupResources

    note right of StateValidation
        Differentiates between new and
        existing execution states
        Validates orchestrator matching
    end note

    note right of MachineProcessing
        Resolves appropriate machine version
        Validates input against contracts
        Executes machine logic
    end note

    note right of EventProcessing
        Processes machine output
        Handles completion events
        Creates validated events
    end note

    note right of ErrorHandling
        Generates system error events
        Ensures proper cleanup
        Routes errors to initiator
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

    C->>+O: execute(event, opentelemetry)
    O->>+OT: startActiveSpan()

    %% Lock and State Management
    alt Requires locking
    O->>+M: lock(event.subject)
    M-->>-O: lock result
    end
    alt Lock Failed
        O->>OT: logToSpan(ERROR)
        O-->>C: throw ArvoOrchestratorError
    end

    O->>+M: read(event.subject)
    M-->>-O: state data
    alt State Read Failed
        O->>OT: logToSpan(ERROR)
        O-->>C: throw ArvoOrchestratorError
    end

    %% State Validation
    O->>O: validate event subject
    alt Invalid Subject
        O->>OT: logToSpan(ERROR)
        O-->>C: throw Error
    end

    %% State Initialization Check
    alt No State Found
        O->>OT: logToSpan(INFO)
        alt Invalid Init Event
            O->>OT: logToSpan(WARNING)
            O-->>C: return []
        end
    else State Exists
        O->>OT: logToSpan(INFO)
        alt Orchestrator Mismatch
            O->>OT: logToSpan(WARNING)
            O-->>C: return []
        end
    end

    %% Machine Resolution and Execution
    O->>+R: resolve(event)
    R-->>-O: machine instance

    O->>+R: validateInput(event)
    R-->>-O: validate result

    alt Validation Failed
        O->>OT: logToSpan(ERROR)
        O-->>C: throw Error
    end

    O->>+E: execute(state, event, machine)
    E-->>-O: execution result

    %% Event Processing
    rect rgb(200, 200, 240)
        Note over O: Process Machine Events
        loop For Each Event
            O->>O: createEmittableEvent()
            alt Invalid Event
                O->>OT: logToSpan(ERROR)
                O-->>C: throw Error
            end
        end
    end

    %% State Persistence
    O->>+M: write(subject, newState)
    M-->>-O: write confirmation
    O->>OT: logToSpan(INFO)

    %% Cleanup
    alt Lock Was Acquired
        O->>+M: unlock(event.subject)
        M-->>-O: unlock result
        alt Unlock Failed
            O->>OT: logToSpan(WARNING)
        end
    end

    %% Response
    alt Execution Success
        O-->>C: return emittable events
    else Execution Failed
        O->>OT: logToSpan(ERROR)
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
