# ArvoXState: Synchronous State Management for Arvo

ArvoXState is a specialized state management implementation for Arvo, designed to provide XState-like functionality while maintaining Arvo's core principle of synchronous state transitions. This orchestration mechanism ensures a robust, predictable, and easily understandable event-driven system.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation](#installation)
- [Usage](#usage)
  - [Defining a Contract](#defining-a-contract)
  - [Creating a State Machine](#creating-a-state-machine)
- [Components](#components)
- [Default Arvo Actions](#default-arvo-actions)
- [Benefits](#benefits)
- [Limitations](#limitations)

## Overview

ArvoXState adapts the concepts of XState to fit Arvo's synchronous architecture. It ensures that all asynchronous tasks are handled by event handlers, preserving the synchronous nature of state transitions in Arvo.

## Key Features

1. **Synchronous Design**: Enforces a synchronous state engine, differing from XState's asynchronous capabilities.
2. **Event Handler-Centric Approach**: Manages all asynchronous operations through event handlers.
3. **XState-like API**: Provides familiar methods like `setup` and `createMachine` for easy adoption.
4. **Arvo Integration**: Seamlessly integrates with Arvo's event-driven architecture.
5. **Type Safety**: Leverages TypeScript for enhanced type checking and developer experience.
6. **OpenTelemetry Integration**: Built-in support for OpenTelemetry, facilitating distributed tracing and monitoring.

## Usage

### Defining a Contract

First, define a contract using Arvo's contract creation utilities:

```typescript
import { createArvoContract, ArvoErrorSchema } from 'arvo-core';
import { z } from 'zod';

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
import { assign } from 'xstate';

const openAiMachine = ArvoXState.machine
  .setup({
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
    guards: {
      isValidInput: ({ context }) => Boolean(context?.request?.length),
    },
  })
  .createMachine({
    version: '1.0.0',
    id: 'openAiCompletions',
    context: ({ input }) => ({
      request: input.request,
      llm: { response: null },
      error: [],
    }),
    initial: 'validate',
    states: {
      validate: {
        always: [
          { guard: 'isValidInput', target: 'inference' },
          { target: 'error' },
        ],
      },
      inference: {
        entry: [
          {
            type: 'enqueueArvoEvent',
            params: ({ context }) => ({
              type: 'com.openai.completions',
              data: { request: context.request ?? '' },
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
                  response: event.data.response,
                }),
              }),
            ],
          },
          'evt.openai.completions.error': {
            target: 'error',
            actions: [
              assign({
                error: ({ context, event }) => [...context.error, event.data],
              }),
            ],
          },
        },
      },
      error: { type: 'final' },
      done: { type: 'final' },
    },
  });
```

## Components

ArvoXState provides two main methods:

1. **machine.setup**: Configures types, reusable actions, and guards for the state machine.
2. **machine.setup(...).createMachine**: Creates an Arvo-specific XState machine with restricted asynchronous features.

## Default Arvo Actions

ArvoXState includes built-in actions like `enqueueArvoEvent` for appending events to the internal queue.

## Benefits

- **Predictable State Transitions**: Ensures immediate and deterministic state changes.
- **Simplified Debugging**: Easier tracing of state changes and issue diagnosis.
- **Consistency with Arvo**: Aligns with Arvo's overall design principles.
- **Improved Developer Experience**: Familiar XState-like API with Arvo-specific optimizations.

## Limitations

To preserve synchronicity, ArvoXState does not support:

- **invoke (actors)**: Typically introduces asynchronous behavior.
- **after (delays)** (delayed transitions): Removed to prevent time-based asynchronous state changes.
