# `MachineExecutionEngine` Execution Flows

## Overview

This document outlines the execution flows within the MachineExecutionEngine's `.execute` method, providing both state and sequence perspectives of the system's behavior. The documentation aims to give developers a clear understanding of how the engine processes both new and existing machine states.

## State Flow Diagram

The state diagram below illustrates the complete execution path of the `.execute` function. It demonstrates how the engine handles different scenarios and processes states through various phases of execution.

### Key Processing Phases

The execution flow progresses through several distinct phases:

1. **Initialization Phase**: The process begins with machine initialization, where the engine prepares for execution by validating inputs and setting up necessary resources.

2. **State Evaluation**: The engine determines whether it's dealing with a new machine instance or resuming an existing one, branching into appropriate handling paths.

3. **Configuration Phase**: Regardless of the path taken, both flows converge at the actor configuration stage, where the system sets up event queues and error handlers.

4. **Execution Phase**: The final phase involves processing the machine state, handling any volatile contexts, and preparing the output.

```mermaid
stateDiagram-v2
   [*] --> MachineInitialization

   MachineInitialization --> CheckState

   CheckState --> NewMachineFlow: state is null
   CheckState --> ExistingMachineFlow: state exists

   state NewMachineFlow {
       [*] --> ValidateEvent
       ValidateEvent --> CreateNewActor: event type matches source
       ValidateEvent --> Error: event type mismatch
       CreateNewActor --> ConfigureActor
   }

   state ExistingMachineFlow {
       [*] --> CreateActorWithState
       CreateActorWithState --> ConfigureActor
   }

   state ConfigureActor {
       [*] --> SetupEventQueue
       SetupEventQueue --> SetupErrorHandler
       SetupErrorHandler --> StartActor
       StartActor --> SendEvent: in existing flow
       StartActor --> Continue: in new flow
   }

   NewMachineFlow --> MachineExecution
   ExistingMachineFlow --> MachineExecution

   state MachineExecution {
       [*] --> GetSnapshot
       GetSnapshot --> CheckVolatileContext
       CheckVolatileContext --> ProcessVolatileQueue: volatile exists
       CheckVolatileContext --> PrepareOutput: no volatile
       ProcessVolatileQueue --> CleanupVolatile
       CleanupVolatile --> PrepareOutput
   }

   MachineExecution --> ReturnResult
   Error --> [*]: throw error
   ReturnResult --> [*]: return {state, events, finalOutput}
```

## Sequence Diagram

The sequence diagram provides a temporal view of the system's operation, showing how different components interact throughout the execution process. This representation is particularly valuable for understanding the timing and dependencies between system components.

### Component Interactions

The system comprises four main components that interact during execution:

- **Client**: Initiates the execution process
- **ExecuteMachine**: Manages the overall execution flow
- **Actor**: Handles the state machine's actual state transitions
- **Logger**: Provides execution tracking and debugging capabilities

```mermaid
sequenceDiagram
    participant C as Client
    participant OT as OpenTelemetry
    participant ME as MachineExecution
    participant A as Actor

    C->>OT: execute(machine, state, event, opentelemetry)
    OT->>OT: startActiveSpan("Execute Machine")
    OT->>ME: Begin execution with span context

    ME->>ME: Initialize eventQueue[] & errors[]

    alt No existing state
        ME->>OT: Log "Starting new orchestration"
        ME->>ME: Validate event.type === machine.source
        alt Invalid event type
            ME-->>C: Throw Error (Invalid initialization event)
        end
        ME->>A: createActor(machine.logic, {input: event.toJSON()})
    else Has existing state
        ME->>OT: Log "Resuming orchestration"
        ME->>A: createActor(machine.logic, {snapshot: state})
    end

    ME->>A: Subscribe to all events (*.on)
    ME->>A: Subscribe to errors
    ME->>A: start()

    alt Has existing state
        ME->>A: send(event.toJSON())
    end

    ME->>OT: Log "Execution completed"
    ME->>OT: Log "Extracting final state"
    ME->>A: getPersistedSnapshot()
    A-->>ME: Return snapshot

    alt Has volatile context
        ME->>ME: Process volatile.eventQueue
        ME->>ME: Remove volatile context
    end

    alt Has errors
        ME-->>C: Throw first error
    end

    ME->>ME: Extract finalOutput from extracted snapshot
    ME->>ME: Extract existingOutput from existing state
    alt finalOutput equals existingOutput
        ME->>ME: Set finalOutput to null
    end

    ME->>ME: Prepare return object
    ME-->>OT: Return {state, events, finalOutput}
    OT-->>C: Return execution result
```

## Error Handling

The execution engine implements comprehensive error handling throughout the process. Error scenarios are logged and propagated appropriately, ensuring system stability and providing meaningful feedback for debugging purposes.

## State Persistence

The engine maintains state consistency through careful management of the snapshot mechanism. Each execution cycle produces a new snapshot that captures the complete state of the machine, including any volatile contexts that need to be processed.

## Best Practices

When working with the execution engine, consider these key points:

1. Always validate input events before processing to ensure type compatibility.
2. Monitor execution logs for unexpected state transitions or error conditions.
3. Handle volatile contexts appropriately to prevent resource leaks.
4. Implement proper error handling in client code to handle potential execution failures.

## Further Reading

For more detailed information about implementing custom execution flows or extending the existing functionality, please refer to the following resources:

- XState Documentation: [https://stately.ai/docs/quick-start](https://stately.ai/docs/quick-start)
