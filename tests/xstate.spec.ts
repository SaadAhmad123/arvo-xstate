import { assign, createActor, setup } from 'xstate';
import ArvoXState from '../src/ArvoXState';
import {
  ArvoErrorSchema,
  createArvoContract,
  createArvoEventFactory,
  InferArvoContract,
} from 'arvo-core';
import { z } from 'zod';

describe('xstate', () => {
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

  /**
   * This OpenAI machine initially execpts a user input. It then
   * emits an ArvoEvent to invoke a fictisious OpenAI completions
   * service and then expects to recvied an event and then finishes.
   */
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
      error: {},
      done: {},
    },
  });

  it('s', () => {
    const actor = createActor(openAiMachine, {
      input: {
        request: 'Hello',
      },
    });
    actor.start();
    actor.stop();
    console.log(JSON.stringify(actor.getPersistedSnapshot(), null, 2));
  });
});
