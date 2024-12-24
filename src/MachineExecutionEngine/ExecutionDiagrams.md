# Execution Diagrams for `executeMachine`

The state diagram illustrates the execution flow of the executeMachine function, showing the primary paths for both new and existing machine states. It begins with machine initialization, branches based on state existence, and proceeds through configuration and execution phases before ultimately returning the final state and events. The diagram highlights key decision points, error handling paths, and the processing of volatile contexts, providing a clear visualization of the function's state transitions and logic flow.

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

The sequence diagram details the temporal interactions between the client, execution machine, actor, and logger components. It demonstrates the chronological flow of operations, including initialization, state validation, actor creation and configuration, event processing, and final state preparation. This representation is particularly useful for understanding the timing and dependencies of operations, as well as the communication patterns between different parts of the system during machine execution.

```mermaid
sequenceDiagram
   participant C as Client
   participant EM as ExecuteMachine
   participant A as Actor
   participant L as Logger

   C->>EM: Call executeMachine({machine, state, event})
   EM->>EM: Initialize eventQueue[]

   alt No existing state
       EM->>L: Log new orchestration start
       EM->>EM: Validate event type
       alt Invalid event type
           EM-->>C: Throw Error
       end
       EM->>A: createActor(machine.logic, {input: event.toJSON()})
   else Has existing state
       EM->>L: Log resuming orchestration
       EM->>A: createActor(machine.logic, {snapshot: state})
   end

   EM->>A: Set up event listener
   EM->>A: Subscribe to errors
   EM->>A: Start actor

   alt Has existing state
       EM->>A: Send event
   end

   EM->>L: Log execution complete
   EM->>L: Log extracting state

   EM->>A: Get persisted snapshot
   A-->>EM: Return snapshot

   alt Has volatile context
       EM->>EM: Process volatile queue
       EM->>EM: Clean up volatile context
   end

   EM->>EM: Prepare return object
   EM-->>C: Return {state, events, finalOutput}
```
