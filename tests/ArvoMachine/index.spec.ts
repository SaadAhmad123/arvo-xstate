import {
  type ArvoErrorSchema,
  type ArvoErrorType,
  ArvoOrchestrationSubject,
  EventDataschemaUtil,
  cleanString,
  createArvoContract,
  createArvoEvent,
  createArvoEventFactory,
  createArvoOrchestratorContract,
  createArvoOrchestratorEventFactory,
} from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';
import { assign, emit } from 'xstate';
import { z } from 'zod';
import { SimpleMachineMemory, createArvoOrchestrator, setupArvoMachine } from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';

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

    it('should throw error on duplicate service contracts (even with different versions)', () => {
      expect(() =>
        setupArvoMachine({
          contracts: {
            self: testMachineContract.version('0.0.1'),
            services: {
              increment1: incrementServiceContract.version('0.0.1'),
              increment2: incrementServiceContract.version('0.0.2'),
              decrement: decrementServiceContract.version('0.0.1'),
              notification: numberUpdateNotificationContract.version('0.0.1'),
            },
          },
        }),
      ).toThrow(
        "The service contracts must have unique URIs. Multiple versions of the same contract are not allow. The contracts 'increment2' and 'increment1' have the same URI '#/test/service/increment'",
      );

      expect(() =>
        setupArvoMachine({
          contracts: {
            self: testMachineContract.version('0.0.1'),
            services: {
              increment1: incrementServiceContract.version('0.0.1'),
              increment2: incrementServiceContract.version('0.0.1'),
              decrement: decrementServiceContract.version('0.0.1'),
              notification: numberUpdateNotificationContract.version('0.0.1'),
            },
          },
        }),
      ).toThrow(
        "The service contracts must have unique URIs. Multiple versions of the same contract are not allow. The contracts 'increment2' and 'increment1' have the same URI '#/test/service/increment'",
      );
    });

    it('should throw error on self referencing', () => {
      expect(() =>
        setupArvoMachine({
          contracts: {
            self: testMachineContract.version('0.0.1'),
            services: {
              testMachine: testMachineContract.version('0.0.1'),
              increment2: incrementServiceContract.version('0.0.1'),
              decrement: decrementServiceContract.version('0.0.1'),
              notification: numberUpdateNotificationContract.version('0.0.1'),
            },
          },
        }),
      ).toThrow(
        "Circular dependency detected: Machine with URI '#/test/machine' is registered as service 'testMachine'. Self-referential services create execution loops and are prohibited.",
      );
    });

    it('should throw an error when using "actors" parameter', () => {
      expect(() => {
        setupArvoMachine({
          // @ts-ignore
          actors: {},
        });
      }).toThrow(
        cleanString(`
        Configuration Error: 'actor' not supported in Arvo machines
        Arvo machines do not support XState actors as they introduce asynchronous behavior.
        To fix:
        1. Remove the 'actor' configuration
        2. Use Arvo's event-driven patterns instead for asynchronous operations  
      `),
      );
    });

    it('should throw an error when using "delays" parameter', () => {
      expect(() => {
        setupArvoMachine({
          // @ts-ignore
          delays: {},
        });
      }).toThrow(
        cleanString(`
        Configuration Error: 'delays' not supported in Arvo machines
        Arvo machines do not support XState delay transitions as they introduce asynchronous behavior.
        To fix:
        1. Remove the 'delays' configuration
        2. Use Arvo's event-driven patterns instead for asynchronous operations 
      `),
      );
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
          errors: ({ context, event }) => [...context.errors, event.data as z.infer<typeof ArvoErrorSchema>],
        }),
      },
      guards: {
        isIncrement: ({ context }) => context.type === 'increment',
        isDecrement: ({ context }) => context.type === 'decrement',
      },
    });

    it('should throw error on version mismatch', () => {
      expect(() =>
        setup.createMachine({
          version: '0.0.3',
        } as any),
      ).toThrow("Version mismatch: Machine version must be '0.0.1' or undefined, received '0.0.3'");
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

      expect(machine.source).toBe('arvo.orc.test');
      expect(machine.logic).toBeDefined();
      expect(machine.version).toBe('0.0.1');
      expect(machine.id).toBe('counter');

      const orchestrator = createArvoOrchestrator({
        memory: new SimpleMachineMemory(),
        executionunits: 0.1,
        machines: [machine],
      });

      const eventSubject = ArvoOrchestrationSubject.new({
        orchestator: 'arvo.orc.test',
        version: '0.0.1',
        initiator: 'com.test.service',
      });

      const initEvent = createArvoEventFactory(testMachineContract.version('0.0.1')).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      });

      let output = await orchestrator.execute(initEvent, {
        inheritFrom: 'EVENT',
      });
      expect(output.length).toBe(1);
      expect(output[0].source).toBe('arvo.orc.test');
      expect(output[0].type).toBe('com.number.increment');
      expect(output[0].data.delta).toBe(1);
      expect(output[0].dataschema).toBe(`${incrementServiceContract.uri}/0.0.1`);

      const incrementHandler = createArvoEventHandler({
        contract: incrementServiceContract,
        executionunits: 0.1,
        handler: {
          '0.0.1': async ({ event }) => {
            return {
              type: 'evt.number.increment.success',
              data: {
                newValue: event.data.delta + 9,
              },
            };
          },
          '0.0.2': async ({ event }) => {
            return {
              type: 'evt.number.increment.success',
              data: {
                newValue: event.data.delta + 9,
              },
            };
          },
        },
      });

      const nextEvent = await incrementHandler.execute(output[0]);

      output = await orchestrator.execute(nextEvent[0], {
        inheritFrom: 'EVENT',
      });

      console.log(JSON.stringify({ ssss: output }, null, 2));

      expect(output.length).toBe(2);
      expect(output[0].source).toBe('arvo.orc.test');
      expect(output[0].type).toBe('notif.number.update');
      expect(output[0].data.delta).toBe(1);
      expect(output[0].data.type).toBe('increment');

      expect(output[1].source).toBe('arvo.orc.test');
      expect(output[1].type).toBe('arvo.orc.test.done');
      expect(output[1].data.final).toBe(1);
      expect(output[1].to).toBe('com.test.service');
      expect(output[1].dataschema).toBe(`${testMachineContract.uri}/0.0.1`);
    });

    it('should validate events input to the machine', () => {
      const machine = setup.createMachine({
        id: 'counter',
        context: ({ input }) => ({
          ...input.data,
          errors: [] as ArvoErrorType[],
        }),
        initial: 'route',
        states: {
          route: { type: 'final' },
        },
      });

      // TODO: test valid init event
      let validationResult = machine.validateInput(
        createArvoOrchestratorEventFactory(testMachineContract.version('0.0.1')).init({
          source: 'com.test.test',
          data: {
            parentSubject$$: null,
            delta: 1,
            type: 'decrement',
          },
        }),
      );
      expect(validationResult.type).toBe('VALID');

      // TODO: test invalid init event
      validationResult = machine.validateInput(
        createArvoEvent({
          type: testMachineContract.version('0.0.1').accepts.type,
          source: 'test',
          subject: 'test',
          data: {
            parentSubject$$: null,
            delta: 1,
            type: 'test' as any,
          },
          dataschema: EventDataschemaUtil.create(testMachineContract.version('0.0.1')),
        }),
      );
      expect(validationResult.type).toBe('INVALID_DATA');
      if (validationResult.type === 'INVALID_DATA') {
        expect(validationResult.error.errors[0].message).toBe(
          "Invalid enum value. Expected 'increment' | 'decrement', received 'test'",
        );
      }

      validationResult = machine.validateInput(
        createArvoEvent({
          type: testMachineContract.version('0.0.1').accepts.type,
          source: 'test',
          subject: 'test',
          data: {
            parentSubject$$: null,
            delta: 1,
            type: 'increment',
          },
        }),
      );
      expect(validationResult.type).toBe('VALID');

      validationResult = machine.validateInput(
        createArvoEvent({
          type: testMachineContract.version('0.0.1').accepts.type,
          source: 'test',
          subject: 'test',
          data: {
            parentSubject$$: null,
            delta: 1,
            type: 'increment',
          },
          dataschema: `${testMachineContract.uri}/0.0.2`,
        }),
      );
      expect(validationResult.type).toBe('INVALID');
      if (validationResult.type === 'INVALID') {
        expect(validationResult.error.message).toBe(
          "Contract version mismatch: self Contract(version='0.0.1', type='arvo.orc.test', uri=#/test/machine) does not match Event(dataschema='#/test/machine/0.0.2', type='arvo.orc.test')",
        );
      }

      validationResult = machine.validateInput(
        createArvoEvent({
          type: testMachineContract.version('0.0.1').accepts.type,
          source: 'test',
          subject: 'test',
          data: {
            parentSubject$$: null,
            delta: 1,
            type: 'increment',
          },
          dataschema: `${testMachineContract.uri}/invalid/0.0.1`,
        }),
      );
      expect(validationResult.type).toBe('INVALID');
      if (validationResult.type === 'INVALID') {
        expect(validationResult.error.message).toBe(
          "Contract URI mismatch: self Contract(uri='#/test/machine', type='arvo.orc.test') does not match Event(dataschema='#/test/machine/invalid/0.0.1', type='arvo.orc.test')",
        );
      }

      validationResult = machine.validateInput(
        createArvoEvent({
          type: 'com.test.test',
          subject: 'test',
          source: 'test',
          data: {},
        }),
      );
      expect(validationResult.type).toBe('CONTRACT_UNRESOLVED');

      validationResult = machine.validateInput(
        createArvoEvent({
          type: 'com.test.test',
          subject: 'test',
          source: 'test',
          data: {},
          dataschema: 'saad',
        }),
      );
      expect(validationResult.type).toBe('CONTRACT_UNRESOLVED');

      // TODO: test valid increment success event
      validationResult = machine.validateInput(
        createArvoEventFactory(incrementServiceContract.version('0.0.1')).emits({
          type: 'evt.number.increment.success',
          source: 'test',
          subject: 'test',
          data: {
            newValue: 1,
          },
        }),
      );
      expect(validationResult.type).toBe('VALID');

      validationResult = machine.validateInput(
        createArvoEventFactory(incrementServiceContract.version('0.0.2')).emits({
          type: 'evt.number.increment.success',
          source: 'test',
          subject: 'test',
          data: {
            newValue: 1,
          },
        }),
      );
      expect(validationResult.type).toBe('INVALID');
      if (validationResult.type === 'INVALID') {
        expect(validationResult.error.message).toBe(
          "Contract version mismatch: service Contract(version='0.0.1', type='com.number.increment', uri=#/test/service/increment) does not match Event(dataschema='#/test/service/increment/0.0.2', type='evt.number.increment.success')",
        );
      }
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
      }).toThrow(
        cleanString(`
        Configuration Error: 'invoke' not supported
        Location: idle > invoke > onDone
        Arvo machines do not support XState invocations as they introduce asynchronous behavior.
        To fix: Replace 'invoke' with Arvo event-driven patterns for asynchronous operations  
      `),
      );
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
      }).toThrow(
        cleanString(`
        Configuration Error: 'after' not supported
        Location: idle > after > 1000
        Arvo machines do not support delayed transitions as they introduce asynchronous behavior.
        To fix: Replace 'after' with Arvo event-driven patterns for time-based operations  
      `),
      );
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
      }).toThrow(
        cleanString(`
        Configuration Error: Reserved action name 'enqueueArvoEvent'
        Location: enqueueArvoEvent > on > * > target
        'enqueueArvoEvent' is an internal Arvo system action and cannot be used in machine configurations.
        To fix: Use a different name for your action  
      `),
      );
    });
  });
});
