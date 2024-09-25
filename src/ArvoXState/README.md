# ArvoXState: Synchronous State Management in Arvo

ArvoXState is a specialized implementation of state management in Arvo, designed to maintain synchronous operations while providing functionality similar to XState. This approach ensures that all asynchronous tasks are handled by event handlers, maintaining Arvo's core principle of synchronous state transitions.

By adopting this orchestration mechanism, Arvo aims to provide a robust, predictable, and easily understandable event-driven system.

## Key Features and Limitations

- **Synchronous Design**: ArvoXState enforces a synchronous state engine, differing from XState's ability to handle asynchronous operations directly within the state machine.
- **Static Setup Function**: The `ArvoXState.setup` function serves as the primary method for configuring state machines, mimicking XState's API where possible.
- **Restricted Functionality**: To preserve synchronicity, ArvoXState intentionally omits or modifies certain XState features:
  - invoke: Not supported, as it typically introduces asynchronous behavior.
  - after (delayed transitions): Removed to prevent time-based asynchronous state changes.
- **Event Handler-Centric Approach**: All asynchronous operations must be managed through event handlers, maintaining a clear separation between state logic and asynchronous processes.

## Benefits

- **Predictable State Transitions**: By enforcing synchronous operations, ArvoXState ensures that state transitions are immediate and deterministic.
- **Simplified Debugging**: The absence of built-in asynchronous features makes it easier to trace state changes and diagnose issues.
- **Consistent with Arvo's Philosophy**: ArvoXState aligns with Arvo's overall design principles, providing a cohesive development experience.

## Components

This class provides methods to create a Arvo-specific XState state machine using the following methods

- **setup**: It is similar to the XState `setup` function except for the restricted `actors` and `delays` config. It is encouraged to read the XState `setup` function [documentation](https://stately.ai/docs/setup) to know more about it. At a high-level, this function allows to set the `types` and reusable `actions` and `guard` for a more ergonomic developer experience.

- **setup(...).createMachine**: It is also similar to the XState `createMachine` function except for restricting the `invoke` and `after` keywords as configuation key on runtime. This function create a state chart which can then be interpreted by the XState actors for execution.

## Usage

The following is an example usage of the `ArvoXState` state machine

First, a contract is defined. This is a sample contract of an OpenAI Completions event handler

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

Then a machine can be defined

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
          type: 'emitArvoEvent',
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
