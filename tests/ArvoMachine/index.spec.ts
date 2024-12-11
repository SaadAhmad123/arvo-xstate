import { setupArvoMachine, createArvoMachineRunner } from '../../src';
import { assign, emit } from 'xstate';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { z } from 'zod';
import {
  createArvoContract,
  createArvoOrchestratorContract,
  ArvoErrorSchema,
  ArvoOrchestrationSubject,
  createArvoEventFactory,
  ArvoErrorType,
} from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';

describe('ArvoXState', () => {
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

  describe('setup', () => {
    it('should create a valid machine setup', () => {
      const setup = setupArvoMachine({
        contracts: {
          self: testMachineContract.version('0.0.1'),
          services: {
            increment: incrementServiceContract.version('0.0.1'),
            decrement: decrementServiceContract.version('0.0.1'),
            notification: numberUpdateNotificationContract.version('0.0.1'),
          },
        },
        types: {} as {
          context: {
            delta: number;
            type: 'increment' | 'decrement';
          };
        },
        actions: {
          notification: emit(({ context }) => ({
            type: 'notif.number.update' as const,
            data: {
              delta: context.delta,
              type: context.type,
            },
          })),
        },
        guards: {
          isIncrement: ({ context }) => context.type === 'increment',
        },
      });

      expect(setup).toHaveProperty('createMachine');
      expect(typeof setup.createMachine).toBe('function');
    });

    it('should throw an error when using "actors" parameter', () => {
      expect(() => {
        setupArvoMachine({
          // @ts-ignore
          actors: {},
        });
      }).toThrow(/Unsupported 'actor' parameter/);
    });

    it('should throw an error when using "delays" parameter', () => {
      expect(() => {
        setupArvoMachine({
          // @ts-ignore
          delays: {},
        });
      }).toThrow(/Unsupported 'delays' parameter/);
    });

    it('should throw an error when using reserved action name "enqueueArvoEvent"', () => {
      expect(() => {
        // @ts-ignore
        setupArvoMachine({
          actions: {
            enqueueArvoEvent: () => {},
          },
        });
      }).toThrow(/Reserved action name 'enqueueArvoEvent'/);
    });
  });

  describe('createMachine', () => {
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

    it('should create a valid machine', async () => {
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

      expect(machine.logic).toBeDefined();
      expect(machine.version).toBe('0.0.1');
      expect(machine.id).toBe('counter');

      const orchestrator = createArvoMachineRunner({
        contract: testMachineContract,
        executionunits: 0.1,
        machines: {
          '0.0.1': machine,
        },
      });

      const eventSubject = ArvoOrchestrationSubject.new({
        orchestator: 'arvo.orc.test',
        version: '0.0.1',
        initiator: 'com.test.service',
      });

      const initEvent = createArvoEventFactory(
        testMachineContract.version('0.0.1'),
      ).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      });

      let output = orchestrator.execute({
        event: initEvent,
        state: null,
        parentSubject: null,
      }, {inheritFrom: "EVENT"});
      expect(output.executionStatus).toBe('success');
      expect(output.events.length).toBe(1);
      expect(output.events[0].source).toBe('arvo.orc.test');
      expect(output.events[0].type).toBe('com.number.increment');
      expect(output.events[0].data.delta).toBe(1);
      expect(output.events[0].dataschema).toBe(
        `${incrementServiceContract.uri}/0.0.1`,
      );

      const incrementHandler = createArvoEventHandler({
        contract: incrementServiceContract,
        executionunits: 0.1,
        handler: {
          '0.0.1': async ({event}) => {
            return {
              type: 'evt.number.increment.success',
              data: {
                newValue: event.data.delta + 9
              }
            }
          }
        }
      })


      const nextEvent = await incrementHandler.execute(output.events[0])

      output = orchestrator.execute({
        event: nextEvent[0],
        state: output.state,
        parentSubject: null,
      }, {inheritFrom: "EVENT"});

      console.log(JSON.stringify(output, null, 2))

      expect(output.executionStatus).toBe('success');
      expect(output.events.length).toBe(2);
      expect(output.events[0].source).toBe('arvo.orc.test');
      expect(output.events[0].type).toBe('notif.number.update');
      expect(output.events[0].data.delta).toBe(1);
      expect(output.events[0].data.type).toBe('increment');

      expect(output.events[1].source).toBe('arvo.orc.test');
      expect(output.events[1].type).toBe('arvo.orc.test.done');
      expect(output.events[1].data.final).toBe(1);
      expect(output.events[1].to).toBe('com.test.service');
      expect(output.events[1].dataschema).toBe(
        `${testMachineContract.uri}/0.0.1`,
      );
    });

    it('should throw an error when using "invoke" in machine config', () => {
      const { createMachine } = setup;

      expect(() => {
        createMachine({
          id: 'counter',
          context: ({ input }) => ({
            ...input.data,
            errors: [],
          }),
          initial: 'idle',
          states: {
            idle: {
              invoke: {
                // @ts-ignore
                src: 'someService',
                onDone: 'success',
              },
            },
            success: {},
          },
        });
      }).toThrow(/Unsupported 'invoke' configuration/);
    });

    it('should throw an error when using "after" in machine config', () => {
      const { createMachine } = setup;

      expect(() => {
        createMachine({
          version: '0.0.1',
          id: 'counter',
          context: ({ input }) => ({
            ...input.data,
            errors: [],
          }),
          initial: 'idle',
          states: {
            idle: {
              after: {
                1000: 'timeout',
              },
            },
            timeout: {},
          },
        });
      }).toThrow(/Unsupported 'after' configuration/);
    });

    it('should throw an error when using "enqueueArvoEvent" in machine config', () => {
      const { createMachine } = setup;

      expect(() => {
        createMachine({
          id: 'counter',
          context: ({ input }) => ({
            ...input.data,
            errors: [],
          }),
          initial: 'enqueueArvoEvent',
          states: {
            enqueueArvoEvent: {
              on: {
                '*': { target: 'timeout' },
              },
            },
            timeout: {},
          },
        });
      }).toThrow(/Unsupported 'enqueueArvoEvent' configuration/);
    });
  });
});
