# ArvoXState: Synchronous State Management for Arvo

ArvoXState is a specialized state management implementation for Arvo, designed to provide XState-like functionality while maintaining Arvo's core principle of synchronous state transitions. This orchestration mechanism ensures a robust, predictable, and easily understandable event-driven system.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Benefits](#benefits)
- [Components](#components)
- [Default Arvo Actions](#default-arvo-actions)
- [Usage](#usage)
  - [Defining a Contract](#defining-a-contract)
  - [Creating a State Machine](#creating-a-state-machine)
- [Limitations](#limitations)

## Overview

ArvoXState adapts the concepts of XState to fit Arvo's synchronous architecture. It ensures that all asynchronous tasks are handled by event handlers, preserving the synchronous nature of state transitions in Arvo.

## Key Features

1. **Synchronous Design**: Enforces a synchronous state engine, differing from XState's asynchronous capabilities.
2. **Static Setup Function**: Uses `ArvoXState.setup` for configuring state machines, mimicking XState's API where possible.
3. **Event Handler-Centric Approach**: Manages all asynchronous operations through event handlers.
4. **Restricted Functionality**: Intentionally omits certain XState features to preserve synchronicity.

## Benefits

- **Predictable State Transitions**: Ensures immediate and deterministic state changes.
- **Simplified Debugging**: Easier tracing of state changes and issue diagnosis.
- **Consistency with Arvo**: Aligns with Arvo's overall design principles.

## Components

ArvoXState provides two main methods to create Arvo-specific XState state machines:

1. **setup**: Similar to XState's `setup` function, but with restricted `actors` and `delays` config. It sets up `types`, reusable `actions`, and `guards` for an ergonomic developer experience.

2. **setup(...).createMachine**: Analogous to XState's `createMachine` function, but restricts the use of `invoke` and `after` keywords in the configuration.

For more details on the `setup` function, refer to the [XState setup documentation](https://stately.ai/docs/setup).

## Default Arvo Actions

ArvoXState defines helpful default actions, including:

- **enqueueArvoEvent**: Appends an `ArvoEvent` to the internal event queue. These events are returned by the actor which can then be emitted for processing.

Example usage:

```typescript
entry: [
  {
    type: 'enqueueArvoEvent',
    params: ({ context }) =>
      createArvoEventFactory(openAIContract).accepts({
        data: {
          request: context.request ?? '',
        },
        source: 'arvo.xstate.llm',
        subject: 'test',
      }),
  },
],
```

## Usage

### Defining a Contract

First, define a contract. Here's an example of an OpenAI Completions event handler contract:

```typescript
import {
  ArvoErrorSchema,
  createArvoContract,
  createArvoEventFactory,
  InferArvoContract,
} from 'arvo-core';

const openAIContract = createArvoContract({
  uri: '#/test/openai/completions',
  accepts: {
    type: 'com.openai.completions',
    schema: z.object({
      request: z.string(),
    }),
  },
  emits: {
    'evt.openai.completions.success': z.object({
      response: z.string(),
    }),
    'evt.openai.completions.error': ArvoErrorSchema,
  },
});
```

### Creating a State Machine

Then, create a machine using ArvoXState:

```typescript
import { ArvoXState } from 'arvo-xstate';

const openAiMachine = ArvoXState.setup({
  types: {
    context: {} as {
      request: string | null;
      llm: {
        response: string | null;
      };
      error: z.infer<typeof ArvoErrorSchema>[];
    },
    input: {} as {
      request: string;
    },
    events: {} as InferArvoContract<typeof openAIContract>['emittableEvents'],
  },
  actions: {},
  guards: {
    isValidInput: ({ context }) => Boolean(context?.request?.length),
  },
}).createMachine({
  version: '1.0.0',
  id: 'string',
  context: ({ input }) => ({
    request: input.request,
    llm: {
      response: null,
    },
    error: [],
  }),
  initial: 'validate',
  states: {
    validate: {
      always: [
        {
          guard: 'isValidInput',
          target: 'inference',
        },
        {
          target: 'error',
        },
      ],
    },
    inference: {
      description: 'Contractual event <arvo>',
      entry: [
        {
          type: 'enqueueArvoEvent',
          params: ({ context }) =>
            createArvoEventFactory(openAIContract).accepts({
              data: {
                request: context.request ?? '',
              },
              source: 'arvo.xstate.llm',
              subject: 'test',
            }),
        },
      ],
      on: {
        'evt.openai.completions.success': {
          target: 'done',
          actions: [
            assign({
              llm: ({ event }) => ({
                response: event.data.response ?? '',
              }),
            }),
          ],
        },
        'evt.openai.completions.error': {
          target: 'error',
          actions: [
            assign({
              error: ({ context, event }) => [
                ...(context?.error || []),
                event.data,
              ],
            }),
          ],
        },
        'sys.com.openai.completions.error': {
          target: 'error',
          actions: [
            assign({
              error: ({ context, event }) => [
                ...(context?.error || []),
                event.data,
              ],
            }),
          ],
        },
      },
    },
    error: {
      type: 'final',
    },
    done: {
      type: 'final',
    },
  },
});
```

### Limitations

To preserve synchronicity, ArvoXState does not support:

- **invoke**: Typically introduces asynchronous behavior.
- **after** (delayed transitions): Removed to prevent time-based asynchronous state changes.
