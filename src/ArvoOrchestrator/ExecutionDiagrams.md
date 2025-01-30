# ArvoOrchestrator Technical Documentation

This technical documentation provides a comprehensive overview of the ArvoOrchestrator's event processing system, illustrating both the state transitions and component interactions that occur during event execution. Through detailed state and sequence diagrams, engineers can trace how events flow through the handler, understand where and why different types of errors might occur, and identify the specific interactions between the Orchestrator, Memory, Registry, and ExecutionEngine components. The documentation maps out the complete lifecycle of event processing, from initial validation through lock management, state handling, and eventual event emission, with particular attention to error scenarios and their propagation paths. Engineers working with this handler can use these diagrams to understand the extensive validation checks, state management procedures, and error handling mechanisms that ensure reliable event processing. The documentation serves as both a reference for understanding normal operation flows and a troubleshooting guide for identifying where and why different types of errors might emerge during event processing, making it particularly valuable for engineers maintaining and debugging the handler in production environments.

## Execution Flow

The state diagram below illustrates the core execution flow:

```mermaid
stateDiagram-v2
    [*] --> StartExecution
    StartExecution --> ValidateSubject: Create Producer Span
    ValidateSubject --> CheckLocking: Valid Subject
    ValidateSubject --> HandleError: Invalid Subject (ExecutionViolation)
    note right of ValidateSubject
        ExecutionViolation if invalid
    end note

    CheckLocking --> AttemptLock: Requires Lock
    CheckLocking --> SkipLock: Sequential Machine

    AttemptLock --> LockAcquired: Success
    AttemptLock --> HandleError: Not Acquired/Failure (TransactionViolation)
    note right of AttemptLock
        TransactionViolation on failure
    end note

    LockAcquired --> ReadState
    SkipLock --> ReadState

    ReadState --> StateValidation: Success
    ReadState --> HandleError: Failure (TransactionViolation)
    note right of ReadState
        TransactionViolation on failure
    end note

    StateValidation --> InitialStateCheck

    InitialStateCheck --> ValidateInitEvent: No State
    InitialStateCheck --> ValidateOrchestrator: Has State

    ValidateInitEvent --> ResolveMachine: Source Match
    ValidateInitEvent --> EmitEmpty: Type Mismatch

    ValidateOrchestrator --> ResolveMachine: Match
    ValidateOrchestrator --> EmitEmpty: Subject Mismatch

    ResolveMachine --> ValidateInput: Success
    ResolveMachine --> HandleError: Failure (ConfigViolation)
    note right of ResolveMachine
        ConfigViolation if no matching machine
    end note

    ValidateInput --> ExecuteMachine: Valid Contract & Data
    ValidateInput --> HandleError: Event data conflict with contract (ContractViolation)
    ValidateInput --> HandleError: Event requires a contract not configured in the machine (ConfigViolation)
    note right of ValidateInput
        ConfigViolation or ContractViolation
    end note

    ExecuteMachine --> ProcessOutput: Success
    ExecuteMachine --> HandleError: Error in Execution (Error)
    ExecuteMachine --> HandleError: Violation error in exection (ExectionViolation )
    note right of ExecuteMachine
        Error object become system error events
        and Violations bubble up
    end note

    ProcessOutput --> CreateEmittableEvents: Has Events/Output

    CreateEmittableEvents --> ValidateEmittables
    note right of CreateEmittableEvents
        Creates ArvoEvents with validation
    end note

    ValidateEmittables --> PersistState: Valid
    ValidateEmittables --> HandleError: Emitable data conflicts with contracts (ContractViolation)
    ValidateEmittables --> HandleError: Emitable data causes malformed parentSubject$$ (ExecutionViolation)
    note right of ValidateEmittables
        ContractViolation or ExecutionViolation on invalid events
    end note

    PersistState --> Cleanup: Success
    PersistState --> HandleError: Failure (TransactionViolation)
    note right of PersistState
        TransactionViolation on failure
    end note

    HandleError --> CreateErrorEvent: Non-Violation Error
    HandleError --> [*]: ViolationError
    note right of HandleError
        System errors create error events
    end note
    note right of HandleError
        ViolationError bubble up. These
        are all the error which inherit from ViolationError
        base class. These include TransactionViolation,
        ContractViolation, etc
    end note

    CreateErrorEvent --> Cleanup
    EmitEmpty --> Cleanup

    Cleanup --> EndSpan: No Lock
    Cleanup --> ReleaseLock: Has Lock

    ReleaseLock --> EndSpan
    note right of ReleaseLock
        Logs warning if unlock fails
    end note

    EndSpan --> EmitEvents
    EmitEvents --> [*]
```

## Component Interactions

The sequence diagram below shows the detailed interactions between components:

```mermaid
sequenceDiagram
    participant C as Caller
    participant O as Orchestrator
    participant M as Memory
    participant R as Registry
    participant E as ExecutionEngine

    C->>+O: execute(event)    
    Note over O: Start OpenTelemetry span
    
    O->>O: validateConsumedEventSubject()
    alt invalid event subject
        O-->>C: throw ExectionViolation
    end
    alt requires locking
        O->>+M: lock(event.subject)
        M-->>-O: lock status
        alt lock not acquired
            O-->>C: throw TransactionViolation
        end
    end
    
    O->>+M: read(event.subject)
    M-->>-O: state
    
    alt no state && event.type != source
        O-->>C: return []
    else has state && subject.orchestrator != source
        O-->>C: return []
    end
    
    O->>+R: resolve(event)
    R-->>-O: machine
    alt no machine found
        O-->>C: throw ConfigViolation
    end
    
    O->>O: machine.validateInput(event)
    alt contract unresolved
        O-->>C: throw ConfigViolation
    else invalid data/schema
        O-->>C: throw ContractViolation
    end
    
    O->>+E: execute(state, event, machine)
    E-->>-O: execution result
    
    loop for each raw event
        O->>O: createEmittableEvent()
        alt invalid parentSubject$$
            O-->>C: throw ExecutionViolation
        else invalid event data
            O-->>C: throw ContractViolation
        end
    end
    
    O->>+M: write(id, newRecord, prevRecord)
    M-->>-O: write status
    alt write failed
        O-->>C: throw TransactionViolation
    end
    
    Note over O: Start cleanup
    
    alt has lock
        O->>+M: unlock(event.subject)
        M-->>-O: unlock status
        alt unlock failed
            Note over O: Log warning
        end
    end
    
    Note over O: End OpenTelemetry span
    O-->>-C: return emittable events
    
    alt any error during execution
        Note over O: If ViolationError
        O-->>C: throw error
        Note over O: If other Error
        O->>O: create system error event
        O-->>C: return [error event]
    end
```