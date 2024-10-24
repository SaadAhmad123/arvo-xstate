---
title: Arvo Machine & Event Emitting
group: Guides
---

# Arvo Machine & Event Emitting

This document provides detailed information about three core components of the Arvo system: `setupArvoMachine`, `setupArvoMachine.createMachine`, and `ArvoMachine`. These components work together to create and manage state machines within the Arvo event-driven architecture.

## Table of Contents

1. [setupArvoMachine](#setuparvomachine)
2. [setupArvoMachine.createMachine](#setuparvomachinecreatemachine)
3. [ArvoMachine](#arvomachine)
4. [Event emission](#event-emission-emit-vs-enqueuearvoevent)

## setupArvoMachine

`setupArvoMachine` is a function that establishes the foundation for creating Arvo-compatible state machines. It configures the core elements of an Arvo state machine and enforces Arvo-specific constraints.

### Key Features

- Enforces synchronous behavior
- Implements Arvo-specific constraints and features
- Includes built-in actions like `enqueueArvoEvent`
- Prevents usage of asynchronous features like 'actors' or 'delays'

### Usage

```typescript
const setup = setupArvoMachine({
  contracts: {
    self: selfContract,
    services: {
      serviceContract1,
      serviceContract2,
    },
  },
  types: {
    context: {} as YourContextType,
    tags: {} as YourTagsType,
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

### Parameters

- `contracts`: Object containing the self contract and service contracts
- `types` (optional): Defines the shape of the context and tags
- `actions` (optional): Custom actions for the machine
- `guards` (optional): Custom guards for the machine

### Returns

An object containing the `createMachine` function.

## setupArvoMachine.createMachine

`createMachine` is a method returned by `setupArvoMachine`. It creates an Arvo-compatible XState machine based on the provided configuration.

### Key Features

- Creates an ArvoMachine instance
- Performs additional checks to ensure Arvo constraints
- Disallows 'invoke' and 'after' configurations

### Usage

```typescript
const machine = setup.createMachine({
  id: 'myMachine',
  version: '1.0.0',
  context: ({ input }) => ({
    // Initial context based on input
  }),
  initial: 'initialState',
  states: {
    initialState: {
      on: {
        SOME_EVENT: {
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

### Parameters

- `config`: The configuration object for the machine, including:
  - `id`: A unique identifier for the machine
  - `version`: The version of the machine
  - `context`: A function to initialize the machine's context
  - `initial`: The initial state of the machine
  - `states`: An object defining the states and transitions of the machine

### Returns

An `ArvoMachine` instance.

## ArvoMachine

`ArvoMachine` is a class that represents an Arvo-compatible state machine. It encapsulates the logic and metadata required for an Arvo orchestrator to use the machine.

### Key Features

- Combines XState's actor logic with Arvo-specific contracts
- Includes versioning information
- Designed to be consumed by an Arvo orchestrator

### Structure

```typescript
class ArvoMachine<
  TId extends string,
  TVersion extends ArvoOrchestratorVersion,
  TSelfContract extends ArvoOrchestratorContract,
  TServiceContract extends Record<string, ArvoContract>,
  TLogic extends AnyActorLogic,
> {
  constructor(
    public readonly id: TId,
    public readonly version: TVersion,
    public readonly contracts: {
      self: TSelfContract;
      services: TServiceContract;
    },
    public readonly logic: TLogic,
  ) {}
}
```

### Properties

- `id`: A unique identifier for the machine
- `version`: The version of the machine, following semantic versioning
- `contracts`: An object containing the self contract and service contracts
- `logic`: The XState actor logic defining the machine's behavior

### Usage

It's recommended to create `ArvoMachine` instances using `setupArvoMachine().createMachine()` rather than instantiating them directly. This ensures all Arvo-specific constraints and setup are properly applied.

```typescript
const arvoMachine = setup.createMachine({
  // Machine configuration
});

console.log(arvoMachine.id); // Access the machine's ID
console.log(arvoMachine.version); // Access the machine's version
// Use arvoMachine in your Arvo orchestrator
```

By using these components together, you can create robust, type-safe, and Arvo-compatible state machines for your event-driven systems.

## Event Emission: 'emit' vs 'enqueueArvoEvent'

In the Arvo system orchestration, there are two primary methods for emitting events: 'emit' and 'enqueueArvoEvent'. Understanding when to use each is crucial for maintaining type safety and adhering to defined contracts.

### emit

The 'emit' function is used to emit events that are defined by the service contracts.

#### Key Features:

- Provides strict schema validation on the event data
- Ensures type safety by adhering to the defined contract
- Helps catch potential errors at compile-time

#### When to Use:

Use 'emit' when you're emitting events that are explicitly defined in your service contracts. This is the preferred method for most cases as it provides an additional layer of safety and validation.

#### Example:

```typescript
import { emit } from 'xstate';

const llmMachine = setupArvoMachine({
  // ... other configuration
}).createMachine({
  // ... other machine config
  states: {
    someState: {
      entry: [
        emit(({ context }) => ({
          type: 'com.openai.completions',
          data: {
            request: context.request,
          },
        })),
      ],
      // ... other state config
    },
  },
});
```

### enqueueArvoEvent

The 'enqueueArvoEvent' action is used to emit events that are not defined by the service contracts.

#### Key Features:

- Skips strict schema validation on the event data
- Allows for more flexible event emission
- Useful for dynamic or runtime-determined events

#### When to Use:

Use 'enqueueArvoEvent' when you need to emit events that are not explicitly defined in your service contracts. This might be necessary for more dynamic scenarios or when dealing with external systems that don't have predefined contracts.

#### Example:

```typescript
const llmMachine = setupArvoMachine({
  // ... other configuration
  actions: {
    emitDynamicEvent: ({ context }) => ({
      type: 'enqueueArvoEvent',
      params: {
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

### Best Practices:

1. Always prefer 'emit' when possible, as it provides better type safety and validation.
2. Use 'enqueueArvoEvent' sparingly and only when dealing with truly dynamic or external events.
3. When using 'enqueueArvoEvent', consider adding runtime checks to ensure the emitted events still meet your system's requirements.
4. Document any use of 'enqueueArvoEvent' clearly, explaining why the more flexible approach was necessary in that specific case.

By understanding and correctly using both 'emit' and 'enqueueArvoEvent', you can build robust and flexible event-driven systems while maintaining as much type safety and contract adherence as possible.
