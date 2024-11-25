[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-white.svg)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)

# Arvo

## What is Arvo

Arvo is an opinionated approach to building event-driven systems. It's designed as a pattern and methodology rather than a rigid framework.

## Principal

The core principle of Arvo is to provide a solid foundation with enough flexibility for customization, allowing you to impose your own technical posture, including security measures, event brokerage, and telemetry. While Arvo offers a structured approach, it encourages developers to implement their own solutions if they believe they can improve upon or diverge from Arvo's principles.

If you're looking to focus on results without getting bogged down in the nitty-gritty of event creation, handling, system state management, and telemetry, while also avoiding vendor lock-in, Arvo provides an excellent starting point. I believe, it strikes a balance between opinionated design and customization, making it an ideal choice for developers who want a head start in building event-driven systems without sacrificing flexibility.

Key features of Arvo include:

- Lightweight and unopinionated core
- Extensible architecture
- Cloud-agnostic design
- Built-in primitives for event-driven patterns
- Easy integration with existing systems and tools

Whether you're building a small microservice or a large-scale distributed system, my hope with Arvo is to offers you some of the tools and patterns to help you succeed in the world of event-driven architecture.

## Arvo suite

Arvo is a collection of libraries which allows you to build the event driven system in the Arvo pattern. However, if you feel you don't have to use them or you can use them as you see fit.

| Scope          | NPM                                                               | Github                                             | Documentation                                                |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Orchestration  | https://www.npmjs.com/package/arvo-xstate?activeTab=readme        | https://github.com/SaadAhmad123/arvo-xstate        | https://saadahmad123.github.io/arvo-xstate/index.html        |
| Core           | https://www.npmjs.com/package/arvo-core?activeTab=readme          | https://github.com/SaadAhmad123/arvo-core          | https://saadahmad123.github.io/arvo-core/index.html          |
| Event Handling | https://www.npmjs.com/package/arvo-event-handler?activeTab=readme | https://github.com/SaadAhmad123/arvo-event-handler | https://saadahmad123.github.io/arvo-event-handler/index.html |

# Arvo - XState

Arvo's event-driven system requires an orchestration mechanism capable of emitting events based on predefined rules. Arvo utilizes a state machine approach, where orchestration is defined in the form of a state chart. This state chart is then interpreted by a state machine engine to calculate the next events to emit and the resulting system state. It should be noted that this package does not impose a storage solution and it is upto the implementation to choose the best storage for events and state snapshots.

## Documentation & Resources

| Source       | Link                                                       |
| ------------ | ---------------------------------------------------------- |
| Package      | https://www.npmjs.com/package/arvo-xstate?activeTab=readme |
| Github       | https://github.com/SaadAhmad123/arvo-xstate                |
| Documenation | https://saadahmad123.github.io/arvo-xstate/index.html      |

## Core Concept

The fundamental idea behind this orchestration is to enable the development of a simple functional model. For demonstration purposes, consider the following conceptual code:

```typescript
const { newSystemState, eventsToEmit } = stateMachineEngine(
  stateChart,
  currentSystemState,
  event,
);
```

To achieve this, the engine must execute events synchronously and provide the new system state along with events that need to be emitted. 

## Event-Driven Patterns and Arvo-XState Implementation

Arvo-XState's foundation is built on pure functional principles where state transitions are deterministic and side-effect free. This fundamental characteristic leads to natural, emergent support for sophisticated event-driven patterns without additional complexity. Just as pure functions naturally support composition, memoization, and parallelization, Arvo-XState's functional core naturally enables these enterprise patterns through its basic operation rather than through bolt-on features.

### Event Sourcing
Arvo-XState's foundation is built on the principle of deterministic state transitions, making it naturally suited for event sourcing. The state machine approach means every state change is triggered by an event, and these events form a complete history. When Arvo-XState processes an event, it maintains a clear sequence of what happened and why. Since the state machine is deterministic, replaying these events will always produce the same result, which is the cornerstone of event sourcing. The system's state at any point can be reconstructed by replaying events up to that moment, providing a reliable audit trail and debugging capabilities.

### CQRS (Command Query Responsibility Segregation)
The architecture of Arvo-XState naturally separates commands and queries through its state machine design. Commands that modify state are handled through explicit state transitions, while the current state can be queried without affecting these transitions. This separation happens because Arvo-XState maintains a clear boundary between state changes (through events) and state reads. The orchestrator can emit different events for reads versus writes, allowing systems to handle them differently. This natural separation makes it straightforward to implement different storage and scaling strategies for reads and writes.

### Saga Pattern
Arvo-XState's state machine approach is well-suited for implementing sagas because it can model complex, long-running transactions as a series of state transitions. The state machine can track the progress of a distributed transaction and manage compensation actions if something fails. Since Arvo-XState maintains the current state and understands the sequence of events, it can coordinate the necessary steps to maintain consistency across different services. If a step fails, the state machine knows exactly where it was in the process and can trigger the appropriate compensation actions.

### Event Choreography
The event-driven nature of Arvo-XState makes it an excellent fit for event choreography. Services can interact through events without being tightly coupled with each other, and the state machine ensures proper coordination. For a reliable operation, the Arvo tries manage this coupliung between service via `ArvoContracts`. With this approach, the services are not tightly coupled rather they are bound by a domain wide contract. The state machine acts as a natural coordinator, ensuring events flow in the right sequence without requiring central orchestration.

### Dead Letter Pattern
The deterministic nature of Arvo-XState's state machine makes it suitable for implementing dead letter queues. When events fail to process, the state machine can transition to error states and emit specific events for the dead letter queue. Since the state machine knows exactly what state it was in when the failure occurred, it can provide rich context about what went wrong. This makes it easier to implement retry mechanisms and handle failed events appropriately.

### Materialized Views
Arvo-XState's ability to emit events based on state transitions makes it effective for maintaining materialized views. As the state machine processes events and changes state, it can emit events specifically designed to update materialized views. The deterministic nature of the state machine ensures that views stay consistent with the underlying state, and the event-driven approach means views can be updated in real-time as changes occur.

### Event Replay
The deterministic nature of Arvo-XState makes it perfect for event replay scenarios. Since state transitions are purely functional (given the same input event and current state, they always produce the same output), replaying events will consistently reproduce the same system state. This makes it possible to debug issues, verify system behavior, or recover from failures by replaying the event stream.

### Event Streaming
Arvo-XState's architecture makes it well-suited for event streaming scenarios. The state machine can process events as they arrive, maintaining state and emitting new events based on state transitions. The deterministic nature of the state machine means events are processed consistently, and the state machine can handle high volumes of events while maintaining system integrity. The ability to emit events based on state transitions means the system can participate in larger event streaming architectures while maintaining clear state management.


## XState Integration

Arvo leverages XState as its state machine engine for several reasons:

- **Established Ecosystem**: XState is a well-established state machine engine in the JavaScript/TypeScript ecosystem.
- **SCXML Compatibility**: It's compatible with the SCXML open standard, aligning with Arvo's commitment to leveraging open standards for widespread integration.
- **Existing Technology**: By using XState, Arvo doesn't need to recreate complex technology. Instead, it can fully utilize XState's engine, documentation, and ecosystem.
- **Cross-domain Understanding**: XState can be understood by both backend and frontend engineers, allowing for similar systems to be deployed across different environments.

## Core Components

This package provides functions and classes to leverage xstate as state machine engine in the Arvo Event Driven system. The following are the main components:

- [ArvoMachine](src/ArvoMachine/README.md) is a restricted version of the XState machine. Its primary distinction lies in its prohibition of delayed transitions and invocations, as these tend to introduce asynchronous behavior. Arvo requires state machines to be fully synchronous.
- [ArvoOrchestrator](src/ArvoOrchestrator/README.md) is a class responsible for interpreting the machine configuration. It calculates the new system state and determines which events to emit based on a particular event execution.

## Installation

You can install the core package via `npm` or `yarn`

```bash
npm install arvo-xstate arvo-core xstate@5.18.1
```

```bash
yarn add arvo-xstate arvo-core xstate@5.18.1
```

## Arvo - Detailed Usage Guide

This guide provides a step-by-step explanation of how to set up and use an Arvo system, with commentary on each step.

### 1. Define Service Contracts

```typescript
const incrementServiceContract = createArvoContract({
  uri: '#/test/service/increment',
  accepts: {
    type: 'com.number.increment',
    schema: z.object({
      delta: z.number(),
    }),
  },
  emits: {
    'evt.number.increment.success': z.object({
      newValue: z.number(),
    }),
  },
});

const decrementServiceContract = createArvoContract({
  uri: '#/test/service/decrement',
  accepts: {
    type: 'com.number.decrement',
    schema: z.object({
      delta: z.number(),
    }),
  },
  emits: {
    'evt.number.decrement.success': z.object({
      newValue: z.number(),
    }),
  },
});

const numberUpdateNotificationContract = createArvoContract({
  uri: '#/test/notification/decrement',
  accepts: {
    type: 'notif.number.update',
    schema: z.object({
      delta: z.number(),
      type: z.enum(['increment', 'decrement']),
    }),
  },
  emits: {},
});
```

**Commentary:**
Service contracts are fundamental in Arvo. They define the interface between your system and external services. Each contract specifies:

- A unique URI for the service
- The type and schema of events the service accepts
- The types and schemas of events the service emits

This approach ensures type safety and clear communication boundaries. By defining these contracts upfront, you're creating a robust and self-documenting system architecture.

### 2. Create Machine Contract

```typescript
const testMachineContract = createArvoOrchestratorContract({
  uri: '#/test/machine',
  name: 'test',
  schema: {
    init: z.object({
      delta: z.number(),
      type: z.enum(['increment', 'decrement']),
    }),
    complete: z.object({
      final: z.number(),
    }),
  },
});
```

**Commentary:**
The machine contract defines the interface for your state machine orchestrator. It specifies:

- A unique URI and name for the machine
- The schema for initialization events (what data is needed to start the machine)
- The schema for completion events (what data is produced when the machine finishes)

This contract acts as a blueprint for your machine, ensuring that it receives the correct input and produces the expected output. It's crucial for maintaining consistency across different parts of your system. This is especially useful in case of one orchestrator calling another orchestrator

### 3. Set Up Machine Environment

```typescript
const setup = setupArvoMachine({
  contracts: {
    self: testMachineContract,
    services: {
      incrementServiceContract,
      decrementServiceContract,
      numberUpdateNotificationContract,
    },
  },
  types: {
    context: {} as {
      delta: number;
      type: 'increment' | 'decrement';
      errors: z.infer<typeof ArvoErrorSchema>[];
    },
  },
  actions: {
    log: ({ context, event }) => console.log({ context, event }),
    assignEventError: assign({
      errors: ({ context, event }) => [
        ...context.errors,
        event.data as z.infer<typeof ArvoErrorSchema>,
      ],
    }),
  },
  guards: {
    isIncrement: ({ context }) => context.type === 'increment',
    isDecrement: ({ context }) => context.type === 'decrement',
  },
});
```

**Commentary:**
This step creates the environment for your state machine. It's where you bring together all the pieces defined earlier:

- You specify the machine's own contract (`self`)
- You list all the service contracts this machine will interact with
- You define the shape of the machine's context (its internal state)
- You can define reusable actions and guards

This setup provides a strongly-typed foundation for your machine, enabling autocompletion and type checking in your IDE. It's a powerful way to catch potential issues early in the development process.

### 4. Define Machine Version

```typescript
const machineV100 = setup.createMachine({
  version: '1.0.0',
  id: 'counter',
  context: ({ input }) => ({
    ...input,
    errors: [] as z.infer<typeof ArvoErrorSchema>[],
  }),
  initial: 'route',
  states: {
    route: {
      always: [
        {
          guard: 'isIncrement',
          target: 'increment',
        },
        {
          guard: 'isDecrement',
          target: 'decrement',
        },
        {
          target: 'error',
          actions: assign({
            errors: ({ context, event }) => [
              ...context.errors,
              {
                errorName: 'Invalid type',
                errorMessage: `Invalid operation type => ${context.type}`,
                errorStack: null,
              },
            ],
          }),
        },
      ],
    },
    increment: {
      entry: [
        emit(({ context }) => ({
          type: 'com.number.increment',
          data: {
            delta: context.delta,
          },
        })),
      ],
      on: {
        'evt.number.increment.success': { target: 'notification' },
        'sys.com.number.increment.error': {
          target: 'error',
          actions: [{ type: 'assignEventError' }],
        },
      },
    },
    decrement: {
      entry: [
        emit(({ context }) => ({
          type: 'com.number.decrement',
          data: {
            delta: context.delta,
          },
        })),
      ],
      on: {
        'evt.number.decrement.success': { target: 'notification' },
        'sys.com.number.increment.error': {
          target: 'error',
          actions: [{ type: 'assignEventError' }],
        },
      },
    },
    notification: {
      entry: [
        { type: 'log' },
        {
          type: 'enqueueArvoEvent',
          params: ({ context }) => ({
            type: 'notif.number.update',
            data: {
              delta: context.delta,
              type: context.type,
            },
          }),
        },
      ],
      always: { target: 'done' },
    },
    done: { type: 'final' },
    error: { type: 'final' },
  },
  output: ({ context }) => ({
    final: context.delta,
  }),
});
```

**Commentary:**
Here, you're defining the actual behavior of your state machine. This includes:

- Version information (useful for managing multiple versions of a machine)
- An ID for the machine
- How the initial context is created from the input
- The states of the machine and transitions between them
- How the final output is produced from the context

This is where the logic of your system lives. The structure provided by Arvo helps keep this logic organized and manageable, even as it grows in complexity.

### 5. Create Orchestrator

```typescript
const orchestrator = createArvoOrchestrator({
  executionunits: 1,
  machines: [machineV100],
  opentelemetry: {
    inheritFrom: 'event',
  },
});
```

**Commentary:**
The orchestrator is the runtime that executes your state machines. By creating it, you're setting up:

- How many execution units to use (for concurrency)
- Which machine versions to include
- How to handle OpenTelemetry for tracing and monitoring

This step bridges the gap between your machine definitions and their actual execution. It's where your static definitions become a running system.

### 6. Execute Orchestration

```typescript
const eventSubject = ArvoOrchestrationSubject.new({
  orchestator: 'arvo.orc.test',
  version: '1.0.0',
  initiator: 'com.test.service',
});

const event = createArvoEventFactory(testMachineContract).accepts({
  source: 'com.test.service',
  subject: eventSubject,
  data: {
    type: 'increment',
    delta: 1,
  },
});

let { state, events, executionStatus, snapshot } = orchestrator.execute({
  event: event,
  state: null,
});
```

**Commentary:**
This is where your system comes to life. You're:

1. Creating a subject for the orchestration (think of it as a unique identifier for this execution)
2. Creating an initial event to kick off the orchestration
3. Executing the orchestrator with this event

The orchestrator returns:

- The new state of the system
- Any events that need to be emitted
- The execution status
- A snapshot of the current state

This step is crucial because it's where your system actually starts doing work in response to events.

### 7. Handle Subsequent Events

```typescript
const nextEvent = createArvoEventFactory(incrementServiceContract).emits({
  type: 'evt.number.increment.success',
  source: 'com.test.service',
  subject: eventSubject,
  data: {
    newValue: 10,
  },
  to: events[0].source,
  traceparent: events[0].traceparent ?? undefined,
  tracestate: events[0].tracestate ?? undefined,
});

{ state, events, executionStatus, snapshot } = orchestrator.execute({ event: nextEvent, state: state });
```

**Commentary:**
This final step shows how to continue the orchestration with subsequent events. You're:

1. Creating a new event (in this case, a response from a service)
2. Executing the orchestrator again with this new event and the previous state

This process continues until the machine reaches a final state. It's how your system responds to and processes a series of events over time.

By following these steps, you create a robust, type-safe, event-driven system using Arvo. Each step builds on the previous ones, creating a coherent and powerful application architecture.

## License

This package is available under the MIT License. For more details, refer to the [LICENSE.md](LICENSE.md) file in the project repository.

## Change Logs

For a detailed list of changes and updates, please refer to the [document](CHANGELOG.md) file.

### SonarCloud Metrics

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=bugs)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=coverage)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-xstate&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-xstate)
