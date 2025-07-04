---
title: 'ArvoMachine: Core Components and Event Emission'
group: Guides
---

# ArvoMachine: Core Components and Event Emission

Arvo Machine is a specialized variant of the XState machine, designed to work seamlessly within the Arvo event-driven architecture. It is run by the Arvo Orchestrator and consists of three core components: `setupArvoMachine`, `setupArvoMachine.createMachine`, and the `ArvoMachine` class itself. This document provides an in-depth look at these components and how they work together to create and manage state machines in Arvo.

## `setupArvoMachine`: Laying the Foundation

`setupArvoMachine` is a critical function that establishes the groundwork for creating Arvo-compatible state machines. Its primary role is to configure the core elements of an Arvo state machine while enforcing Arvo-specific constraints and features.

One of the key aspects of `setupArvoMachine` is its emphasis on synchronous behavior. By design, Arvo machines do not support asynchronous features like XState actors or delay transitions. This constraint ensures predictable state transitions and maintains the deterministic nature of the event-driven system.

In addition to enforcing synchronicity, `setupArvoMachine` also implements built-in actions specific to Arvo, such as `enqueueArvoEvent`. This action allows the machine to enqueue events for processing by the Arvo Orchestrator.

Moreover, it allows for contracts to be bound to the machine context, making the machine aware of the events it can emit and receive. It's important to note that while the `ArvoOrchestrator` enforces strict gatekeeping logic on the input events of the machine based on the contracts, the machine itself allows emitting any kind of event.

The contract binding in `setupArvoMachine` serves several critical purposes:

1. **Type Safety**: By explicitly defining the events the machine can emit and receive, the contracts provide strong type safety. This helps catch potential errors at compile-time and ensures the machine operates within the defined boundaries of the Arvo system.

2. **Explainability**: The contract interface makes the event-driven system more explainable and deterministic. It clearly defines the expected behavior and interactions of the machine, making the system easier to understand and reason about.

3. **Decoupling**: The contracts allow for a decoupled architecture where the machine implementation can evolve independently of the consumers. As long as the contract is adhered to, the internal implementation details can change without affecting the rest of the system.

Here's an example of how you might use `setupArvoMachine`:

```typescript
const setup = setupArvoMachine({
  contracts: {
    self: selfContract.version('0.0.1'),
    services: {
      service1: serviceContract1.version('0.0.1'),
      service2: serviceContract2.version('0.0.1'),
    },
  },
  types: {
    context: {} as YourContextType,
  },
  actions: {
    customAction: ({ context, event }) => {
      // Your custom action logic
    },
  },
  guards: {
    customGuard: ({ context, event }) => {
      // Your custom guard logic
      return true; // or false
    },
  },
});
```

The `contracts` parameter is particularly important as it defines the self contract and service contracts the machine will adhere to. The `self` contract specifies the version of the contract the machine implements, ensuring compatibility with the expected interface.

The `services` contracts define the events the machine emits and regards as services. Interestingly, the event handlers for these contracts don't need to be present during the implementation phase. This allows for a fully decoupled system where the contract interface provides the necessary abstraction and definition of behavior.

## setupArvoMachine.createMachine: Constructing the Machine

Once the foundation is laid with `setupArvoMachine`, the next step is to actually create the Arvo-compatible state machine. This is where `setupArvoMachine.createMachine` comes into play.

`createMachine` takes a machine configuration object and returns an `ArvoMachine` instance. During this process, it performs additional checks to ensure the machine adheres to Arvo's constraints. Notably, it disallows the use of 'invoke' and 'after' configurations, as these introduce asynchronous behavior.

Here's an example of using `createMachine`:

```typescript
const machine = setup.createMachine({
  id: 'myMachine',
  context: ({ input }) => ({
    // Initial context based on input
  }),
  output: ({context}) => ({ ... }),
  initial: 'initialState',
  states: {
    initialState: {
      on: {
        'com.test.test': {
          target: 'nextState',
          actions: ['customAction'],
        },
      },
    },
    nextState: {
      // ...
    },
  },
});
```

The machine configuration includes a unique `id`, the `version` of the machine (which must match the version in the self contract), an initial `context`, the `initial` state, and the `states` of the machine.

## ArvoMachine: The Arvo-Compatible State Machine

The end result of using `setupArvoMachine` and `createMachine` is an instance of the `ArvoMachine` class. This class represents an Arvo-compatible state machine that can be consumed by an Arvo Orchestrator.

An `ArvoMachine` combines XState's actor logic with Arvo-specific contracts and versioning information. It encapsulates all the necessary logic and metadata required for the Arvo Orchestrator to execute the machine as part of an event-driven workflow.

While it's possible to create an `ArvoMachine` instance directly, it's strongly recommended to use the `setupArvoMachine().createMachine()` method instead. This ensures that all Arvo-specific constraints and setup are properly applied.

Here's how you might interact with an `ArvoMachine` instance:

```typescript
const arvoMachine = setup.createMachine({
  // Machine configuration
});

console.log(arvoMachine.id); // Access the machine's ID
console.log(arvoMachine.version); // Access the machine's version
// Use arvoMachine in your Arvo Orchestrator
```

## Event Emission: 'emit' vs 'enqueueArvoEvent' with Domain Routing

When emitting events in Arvo, there are two primary methods: `emit` and `enqueueArvoEvent`. Both support domain-based routing for sophisticated workflow patterns including human-in-the-loop operations, external system integrations, and custom processing pipelines.

### Using 'emit' with Domains

The `emit` function should be used when emitting events that are explicitly defined in your service contracts. It provides strict schema validation and type safety, with optional domain assignment for specialized routing:

```typescript
import { xstate } from 'arvo-xstate';

const llmMachine = setupArvoMachine({
  // ... other configuration
}).createMachine({
  // ... other machine config
  states: {
    someState: {
      entry: [
        // Standard internal processing
        xstate.emit(({ context }) => ({
          type: 'com.openai.completions',
          data: {
            request: context.request,
          },
        })),
        
        // External system integration
        xstate.emit(({ context }) => ({
          domains: ['external'],
          type: 'com.approval.request',
          data: {
            request: context.request,
            amount: context.amount,
          },
        })),
        
        // Multi-domain event for parallel processing
        xstate.emit(({ context }) => ({
          domains: ['default', 'analytics', 'audit'],
          type: 'com.transaction.completed',
          data: {
            transactionId: context.transactionId,
          },
        })),
      ],
      // ... other state config
    },
  },
});
```

### Using 'enqueueArvoEvent' with Domains

`enqueueArvoEvent` should be used for events not explicitly defined in your service contracts, and also supports domain routing:

```typescript
const llmMachine = setupArvoMachine({
  // ... other configuration
  actions: {
    emitDynamicEvent: ({ context }) => ({
      type: 'enqueueArvoEvent',
      params: {
        domains: ['external'], // Route to external processing
        type: 'com.dynamic.event',
        data: {
          dynamicField: context.someValue,
        },
      },
    }),
  },
}).createMachine({
  // ... other machine config
  states: {
    someState: {
      entry: ['emitDynamicEvent'],
      // ... other state config
    },
  },
});
```

### Multiple Events for Multiple Domains

To create separate events for different domains (rather than one event in multiple domains), use multiple emit calls:

```typescript
// Creates two separate events with different IDs
entry: [
  xstate.emit(({ context }) => ({
    domains: ['default'],
    type: 'com.process.standard',
    data: { request: context.request },
  })),
  xstate.emit(({ context }) => ({
    domains: ['external'],
    type: 'com.process.approval',
    data: { request: context.request },
  })),
],
```

### Best Practices

Always prefer `emit` when possible for better type safety and validation. Use `enqueueArvoEvent` sparingly and only when dealing with truly dynamic or external events. When using either method:

- Specify domains explicitly when events need specialized routing
- Use multiple emit calls when you need separate events rather than one event in multiple domains
- Consider the downstream processing requirements when choosing domain assignments
- Add runtime checks when using `enqueueArvoEvent` to ensure emitted events meet system requirements


## Resource Locking and Parallel States

ArvoMachine optimizes its distributed execution through automatic analysis of state machine structure. During creation, it analyzes the machine configuration to determine if distributed resource locking is necessary by detecting the presence of parallel states.

When a machine contains no parallel states or none of the services it uses emit parallel events, its execution is inherently sequential - state transitions happen one after another without possibility of race conditions. In these cases, ArvoMachine automatically sets `requiresResourceLocking` to false, eliminating unnecessary distributed lock overhead.

For machines with parallel states or event emissions where multiple states can be active simultaneously, the locking mechanism remains enabled to ensure safe concurrent operations.

This locking flag is passed to implementations of the `IMachineMemory` interface, allowing memory managers to implement appropriate locking strategies based on their specific requirements. The entire process is automatic and requires no additional configuration from developers.


## Domain-Based Event Processing in ArvoMachine

ArvoMachine events can be categorized into processing domains, enabling sophisticated orchestration patterns. Events without explicit domains are automatically assigned to the 'default' domain for standard internal processing.

### Domain Assignment

Events emitted from ArvoMachine states can specify their processing domains:

```typescript
// Event assigned to default domain (automatic)
xstate.emit(({ context }) => ({
  type: 'com.service.call',
  data: { request: context.request }
}))

// Event assigned to external domain
xstate.emit(({ context }) => ({
  domains: ['external'],
  type: 'com.approval.request', 
  data: { amount: context.amount }
}))
```

### Orchestrator Integration

The ArvoOrchestrator processes domain-assigned events and returns them in structured buckets, enabling downstream systems to handle different domains with specialized logic. This separation allows for clean integration between automated processing, human-in-the-loop workflows, and external system integrations while maintaining the machine's simplicity and focus on business logic.


## Conclusion

The Arvo Machine, composed of `setupArvoMachine`, `createMachine`, and the `ArvoMachine` class, forms the backbone of creating state machines in the Arvo event-driven architecture. By understanding these components and how to properly emit events, you can build robust, type-safe, and Arvo-compatible state machines for your event-driven systems.

Remember, the Arvo Machine is designed to work hand-in-hand with the Arvo Orchestrator. The Orchestrator consumes Arvo Machines and executes them as part of larger, event-driven workflows. By adhering to the principles and best practices outlined in this guide, you can ensure your state machines integrate seamlessly into the Arvo ecosystem.

## Additional Information

A more detailed information is provided [here](https://github.com/SaadAhmad123/arvo-xstate/blob/main/src/ArvoMachine/ExecutionDiagrams.md) on machine input validation which is used by the orchestrator to perform gatekeeping actions.
