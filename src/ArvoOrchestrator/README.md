---
title: Arvo Orchestrator
group: Guides
---

# Arvo Orchestrator

## What is ArvoOrchestrator?

ArvoOrchestrator is a core component of the Arvo event-driven system, designed to manage and execute complex, stateful workflows in distributed environments. It acts as a central coordinator for multiple ArvoMachines, which are specialized state machines tailored for the Arvo ecosystem.

Key aspects of ArvoOrchestrator include:

1. **Event-Driven Execution**: ArvoOrchestrator processes incoming events, using them to trigger state transitions and actions within its managed machines.

2. **State Management**: It maintains and updates the state of ongoing workflows, ensuring consistency and persistence across distributed systems.

3. **Version Control**: ArvoOrchestrator can manage multiple versions of workflow definitions (ArvoMachines), allowing for seamless updates and backward compatibility.

4. **Distributed Architecture Support**: It's designed to operate in distributed systems, handling concerns like event routing and state synchronization.

5. **Contract Enforcement**: ArvoOrchestrator ensures that all events and data conform to predefined contracts, maintaining system integrity.

6. **Error Handling and Reporting**: It provides robust mechanisms for handling and reporting errors that occur during workflow execution.

7. **Observability**: Through integration with OpenTelemetry, ArvoOrchestrator offers enhanced tracing and monitoring capabilities.

8. **Resource Management**: It manages execution units, allowing for controlled resource allocation in distributed environments.

9. **Contract Enforcement**: Ensures that events conform to predefined contracts, maintaining system integrity.

ArvoOrchestrator serves as the backbone for complex, event-driven applications built with Arvo, enabling developers to create scalable, maintainable, and resilient systems.

## Table of Contents

1. [Usage](#usage)
2. [Benefits](#benefits)
3. [Best Practices](#best-practices)

## Usage

The `createArvoOrchestrator` function and `ArvoOrchestrator` class are used together to create and manage complex, event-driven workflows in distributed systems.

### Setting up an Orchestrator

1. Define your ArvoMachines:

   ```typescript
   const machine1 = setupArvoMachine({...}).createMachine({...});
   const machine2 = setupArvoMachine({...}).createMachine({...});
   ```

2. Create the orchestrator:
   ```typescript
   const orchestrator = createArvoOrchestrator({
     executionunits: 2,
     machines: [machine1, machine2],
   });
   ```

### Executing Workflows

Use the `execute` method to process events and advance the workflow:

```typescript
const result = orchestrator.execute({
  event: incomingEvent,
  state: currentState,
  opentelemetry: { inheritFrom: 'event' },
});

// Handle the result
if (result.executionStatus === 'success') {
  // Process emitted events
  result.events.forEach(handleEvent);

  // Store new state for next execution
  saveState(result.state);
} else {
  // Handle error
  console.error('Execution failed:', result.events[0]);
}
```

### Handling Different Versions

The orchestrator can manage multiple versions of your workflow:

```typescript
const orchestrator = createArvoOrchestrator({
  executionunits: 1,
  machines: [machineV1, machineV2],
});
```

The appropriate version will be selected based on the event's subject.

## Best Practices

1. **Use Factory Function**: Always use `createArvoOrchestrator` to create orchestrator instances. This ensures proper setup and typing.

2. **Version Your Machines**: When updating workflow logic, create new versions of your machines rather than modifying existing ones.

3. **Handle All Events**: Ensure your machines handle all possible events, including error scenarios.

4. **Persist State**: Always persist the state returned by the `execute` method for use in subsequent executions.

5. **Leverage OpenTelemetry**: Use the built-in OpenTelemetry support for comprehensive tracing and monitoring.

6. **Respect Execution Units**: Set the `executionunits` parameter appropriately to manage resource allocation in distributed environments.

7. **Use Strict Event Emission**: Prefer using the `emit` function for event emission to benefit from contract validation.

By following these practices and leveraging the benefits of `createArvoOrchestrator` and `ArvoOrchestrator`, you can build robust, scalable, and maintainable event-driven systems with Arvo.
