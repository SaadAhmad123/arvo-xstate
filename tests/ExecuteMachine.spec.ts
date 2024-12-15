import { executeMachine, MachineRegistry, setupArvoMachine } from '../src';
import {
  ArvoErrorSchema,
  ArvoErrorType,
  createArvoContract,
  createArvoEventFactory,
  createArvoOrchestratorContract,
  createArvoOrchestratorEventFactory,
} from 'arvo-core';
import { z } from 'zod';
import { telemetrySdkStart, telemetrySdkStop } from './utils';
import { assign, emit } from 'xstate';

describe('MachineRegistry', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const testMachineContract = createArvoOrchestratorContract({
    uri: '#/test/machine',
    name: 'test',
    versions: {
      '0.0.1': {
        init: z.object({
          delta: z.number(),
          type: z.enum(['increment', 'decrement']),
        }),
        complete: z.object({
          final: z.number(),
        }),
      },
    },
  });

  const incrementServiceContract = createArvoContract({
    uri: '#/test/service/increment',
    type: 'com.number.increment',
    versions: {
      '0.0.1': {
        accepts: z.object({
          delta: z.number(),
        }),
        emits: {
          'evt.number.increment.success': z.object({
            newValue: z.number(),
          }),
        },
      },
      '0.0.2': {
        accepts: z.object({
          delta: z.number(),
        }),
        emits: {
          'evt.number.increment.success': z.object({
            newValue: z.number(),
          }),
        },
      },
    },
  });

  const decrementServiceContract = createArvoContract({
    uri: '#/test/service/decrement',
    type: 'com.number.decrement',
    versions: {
      '0.0.1': {
        accepts: z.object({
          delta: z.number(),
        }),
        emits: {
          'evt.number.decrement.success': z.object({
            newValue: z.number(),
          }),
        },
      },
    },
  });

  const numberUpdateNotificationContract = createArvoContract({
    uri: '#/test/notification/decrement',
    type: 'notif.number.update',
    versions: {
      '0.0.1': {
        accepts: z.object({
          delta: z.number(),
          type: z.enum(['increment', 'decrement']),
        }),
        emits: {},
      },
    },
  });

  const setup = setupArvoMachine({
    contracts: {
      self: testMachineContract.version('0.0.1'),
      services: {
        increment: incrementServiceContract.version('0.0.1'),
        decrement: decrementServiceContract.version('0.0.1'),
        notification: numberUpdateNotificationContract.version('0.0.1'),
      },
    },
    types: {
      context: {} as {
        delta: number;
        type: 'increment' | 'decrement';
        errors: ArvoErrorType[];
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

  const machine = setup.createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5QGMD2BXAdgFzAJwDo8NcBiAbQAYBdRUAB1VgEttnVM6QAPRARgDMAFgICArAE4BAdgAcAJlkTZCgQDYANCACeiAQMoFpQiRPnqxfMfMrSAvna1osuQsXRlyfWkhCMWbBxcvAiCIuJScorKqpo6iPLyYgTyJhJq0nxCahJZ5g5OGDj4RCRgFPI+DEys7Jy+IWGikjIKSirmcboIsnwEaTFK2XyUygUgzsWEzJjIeGAAtmA4pGAAbtgEmOgLAEYlM3OLy5uw6MjIcLBUVX41gfWgIWKU8gRqakKUsmqJskIjMRabrqETGUwGIQyDJ8NRicaTVwEQ7zJYrWDaWAENALLY7fbTWaok4EfDEPA3Lj+WpBBqIF5vD5fH5-AGUIHxBACLIpNKJaRqWHGPgIopIiBgI5o7CrDZ4vYlCVSklnC5XSm+akPYL017vT7fX6KNkc7pJCS80zSARSAxw+SilyKyXE9GY7GoXHbBWE5U4Ul4cka6oBOo6hAM-XMo3-QHAhLfIxpD5JaSUDJieyOCZikqYVBsABmzGQAEMHhQaFT7mG6aF02p3pRYdkG1kBfGEIpDLCPgJ5Mo1MI+Fns-mJfBfIj8NXQ7SnogALRdJdqR1TUoeMCzmmPHiIITyTuJAT9UwSTJqWyCBnrpEo444HfauvCU+ZUZiXqyUbKASdgxkgGNllEEYw72dP1sGfWsFy5KEjBGCQvz4H9TFkf9OT4UwCHPZQhBaMQDBUCDCHzIsS3LWC7jnPcQlUfo1BUSgoW5BRD2PQ99Q+IjMmkMQTBI7Np0ICAOG3TUa3nfdQlhPomP43pLGQ75TQSaRpFw3t5FhAQfjET4s0KJ1CDJVA8Bg6T6PMRjmNY1DUiPTkJEMSg3PczIkiEaQJCEBwHCAA */
    id: 'counter',
    context: ({ input }) => ({
      ...input.data,
      errors: [] as ArvoErrorType[],
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
          emit(({context}) => ({
            type: 'notif.number.update',
            data: {
              delta: -1,
              type: context.type
            }
          }))
        ],
        always: { target: 'done' },
      },
      done: { type: 'final' },
      error: { type: 'final' },
    },
    output: ({ context }) => {
      return {
        final: context.delta,
      };
    },
  });

  it('should execute the machine in case of events', () => {
    const initEvent = createArvoOrchestratorEventFactory(
      testMachineContract.version('0.0.1')
    ).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        delta: 1,
        type: 'increment'
      }
    })

    let result = executeMachine({
      state: null,
      event: initEvent,
      machine,
    })

    expect(result.events[0].type).toBe(incrementServiceContract.type)
    expect(result.state.status).toBe('active')
    expect((result.state as any).value).toBe('increment')
    expect(result.finalOutput).toBe(null)

    result = executeMachine({
      state: result.state,
      machine,
      event: createArvoEventFactory(
        incrementServiceContract.version('0.0.1'),
      ).emits({
        subject: initEvent.subject,
        source: 'com.test.test',
        type: 'evt.number.increment.success',
        data: {
          newValue: 10
        }
      })
    })

    expect(result.finalOutput).not.toBe(null)
    expect(result.events.length).toBe(2)
    expect(result.events[0].type).toBe(numberUpdateNotificationContract.type)
    expect(result.events[0].data.delta).toBe(-1)
    expect(result.events[1].type).toBe(numberUpdateNotificationContract.type)
    expect(result.events[1].data.delta).toBe(1)
    expect(result.state.status).toBe('done')
    expect((result.state as any).value).toBe('done')
    expect(result.finalOutput.final).toBe(1)
    expect((result.state as any)?.context?.arvo$$?.volatile$$?.eventQueue$$).toBe(undefined)
    
    expect(() => {
      executeMachine({
        state: null,
        machine,
        event: createArvoEventFactory(
          incrementServiceContract.version('0.0.1'),
        ).emits({
          subject: initEvent.subject,
          source: 'com.test.test',
          type: 'evt.number.increment.success',
          data: {
            newValue: 10
          }
        })
      })
    }).toThrow(
      "Invalid initialization event: Machine requires source event 'arvo.orc.test' to start, but received event 'evt.number.increment.success' instead. This likely indicates a mismatch between the expected workflow trigger and the actual event sent."
    )
  })

});
