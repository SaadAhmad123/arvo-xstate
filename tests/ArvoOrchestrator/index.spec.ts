import {
  ArvoErrorSchema,
  ArvoOrchestrationSubject,
  createArvoContract,
  createArvoEventFactory,
  createArvoOrchestratorContract,
} from 'arvo-core';
import { z } from 'zod';
import { createArvoOrchestator, setupArvoMachine } from '../../src';
import { assign, emit } from 'xstate';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';

describe('ArvoOrchestrator', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

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

  const machineV100 = setup.createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5QGMD2BXAdgFzAJwDo8NcBiAbQAYBdRUAB1VgEttnVM6QAPRARgDMAFgICArAE4BAdgAcAJlkTZCgQDYANCACeiAQMoFpQiRPnqxfMfMrSAvna1osuQsXRlyfWkhCMWbBxcvAiCIuJScorKqpo6iPLyYgTyJhJq0nxCahJZ5g5OGDj4RCRgFPI+DEys7Jy+IWGikjIKSirmcboIsnwEaTFK2XyUygUgzsWEzJjIeGAAtmA4pGAAbtgEmOgLAEYlM3OLy5uw6MjIcLBUVX41gfWgIWKU8gRqakKUsmqJskIjMRabrqETGUwGIQyDJ8NRicaTVwEQ7zJYrWDaWAENALLY7fbTWaok4EfDEPA3Lj+WpBBqIF5vD5fH5-AGUIHxBACLIpNKJaRqWHGPgIopIiBgI5o7CrDZ4vYlCVSklnC5XSm+akPYL017vT7fX6KNkc7pJCS80zSARSAxw+SilyKyXE9GY7GoXHbBWE5U4Ul4cka6oBOo6hAM-XMo3-QHAhLfIxpD5JaSUDJieyOCZikqYVBsABmzGQAEMHhQaFT7mG6aF02p3pRYdkG1kBfGEIpDLCPgJ5Mo1MI+Fns-mJfBfIj8NXQ7SnogALRdJdqR1TUoeMCzmmPHiIITyTuJAT9UwSTJqWyCBnrpEo444HfauvCU+ZUZiXqyUbKASdgxkgGNllEEYw72dP1sGfWsFy5KEjBGCQvz4H9TFkf9OT4UwCHPZQhBaMQDBUCDCHzIsS3LWC7jnPcQlUfo1BUSgoW5BRD2PQ99Q+IjMmkMQTBI7Np0ICAOG3TUa3nfdQlhPomP43pLGQ75TQSaRpFw3t5FhAQfjET4s0KJ1CDJVA8Bg6T6PMRjmNY1DUiPTkJEMSg3PczIkiEaQJCEBwHCAA */
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

  const machineV200 = setup.createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5QGMD2BXAdgFzAJwDo8NcBiAbQAYBdRUAB1VgEttnVM6QAPRARgDMAFgICArAE4BAdgAcAJlkTZCgQDYANCACeiAQMoFpQiRPnqxfMfMrSAvna1osuQsXRlyfWkhCMWbBxcvAiCIuJScorKqpo6iPLyYgTyJhJq0nxCahJZ5g5OGDj4RCRgFPI+DEys7Jy+IWGikjIKSirmcboIsnwEaTFK2XyUygUgzsWEzJjIeGAAtmA4pGAAbtgEmOgLAEYlM3OLy5uw6MjIcLBUVX41gfWgIWKU8gRqakKUsmqJskIjMRabrqETGUwGIQyDJ8NRicaTVwEQ7zJYrWDaWAENALLY7fbTWaok4EfDEPA3Lj+WpBBqIF5vD5fH5-AGUIHxBACLIpNKJaRqWHGPgIopIiBgI5o7CrDZ4vYlCVSklnC5XSm+akPYL017vT7fX6KNkc7pJCS80zSARSAxw+SilyKyXE9GY7GoXHbBWE5U4Ul4cka6oBOo6hAM-XMo3-QHA-hCaQEb4SMRiWTiPipIQqR1TLaoNgAM2YyAAhg8KDQqfcw3TQpQPu9KLDso3BYmuglZIZYR8BPJlGphHx7ONMKgJfBfIj8DXQ7SnogALRdhCr5OULd8HfsgRKV4ixwTMUldy4ec0x48RBCeTxhCJAT9UwSTJqWyCBl5pEo444S9tXrYRn0yUZ0z4HtTAzB8DGSAY2WUQRjB-Z0-WwQC6yXLkoSMEZU16KDlAEB8+FMAhX2UIQWjEAxc2PWdCAnYtSwrLC7gXa8QlUfo1BUSgoW5BQ7wfVJGQ+OEZFHMQTHowonUICAODATDFxvUJYT6PjpAgyxU2+U0EmkJNcg+eRYX3OFPjHeT8zJVA8FUrjEB47J+MEyCxIfCRDC3PzPySRMJCEBwHCAA */
    version: '2.0.0',
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
            type: 'com.number.increment.1' as any,
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

  const orchestrator = createArvoOrchestator({
    executionunits: 1,
    machines: [machineV100, machineV200],
  });

  test('should initialize correctly', () => {
    expect(orchestrator.source).toBe(testMachineContract.init.type);
    expect(orchestrator.executionunits).toBe(1);
    expect(orchestrator.machines).toHaveLength(2);
    expect(orchestrator.machines[0]).toBe(machineV100);
  });

  test('should throw error if no machines are provided', () => {
    expect(() =>
      createArvoOrchestator({ machines: [], executionunits: 1 }),
    ).toThrow();
  });

  test('should execute increment successfully', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '1.0.0',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('success');
    expect(result.events).toHaveLength(1); // Increment event and notification event
    expect(result.events[0].type).toBe('com.number.increment');
    expect(result.state).toBeDefined();
    expect(result.parentSubject).toBe(null);
    expect(result.subject).toBe(eventSubject);
  });

  // test('should handle errors successfully', () => {
  //   const eventSubject = ArvoOrchestrationSubject.new({
  //     orchestator: 'arvo.orc.test',
  //     version: '2.0.0',
  //     initiator: 'com.test.service',
  //   });

  //   const result = orchestrator.execute({
  //     parentSubject: 'testsubject',
  //     event: createArvoEventFactory(testMachineContract).accepts({
  //       source: 'com.test.service',
  //       subject: eventSubject,
  //       data: {
  //         parentSubject$$: 'testsubject',
  //         type: 'increment',
  //         delta: 1
  //       }
  //     }),
  //     state: null,
  //   });

  //   expect(result.executionStatus).toBe('error');
  //   expect(result.events).toHaveLength(1);
  //   expect(result.events[0].type).toBe(testMachineContract.systemError.type);
  //   expect(result.events[0].subject).toBe('testsubject');
  //   expect(result.events[0].to).toBe('com.test.service');
  //   expect(result.state).toBe(null)
  // });

  test('should handle errors when wrong event.to is defined', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '2.0.0',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
        to: 'com.com.com',
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.state).toBe(null);
  });

  test('should handle errors when wrong event.subject.name is defined', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test.1',
      version: '2.0.0',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.state).toBe(null);
  });

  test('should handle errors when wrong event.subject.version is defined', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '3.0.0',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.state).toBe(null);
  });

  test('should handle errors when wrong event.type is defined when no state is available', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '1.0.0',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(incrementServiceContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.events[0].to).toBe('com.test.service');
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.state).toBe(null);
  });

  test('should have a complete successfull orchestration', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '1.0.0',
      initiator: 'com.test.service',
    });

    let result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('com.number.increment');
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.subject).toBe(eventSubject);
    expect(result.parentSubject).toBe(null);
    expect(result.events[0].to).toBe('com.number.increment');
    expect(result.events[0].data.delta).toBe(1);
    expect(result.state).toBeDefined();

    result = orchestrator.execute({
      parentSubject: null,
      state: result.state,
      event: createArvoEventFactory(incrementServiceContract).emits({
        type: 'evt.number.increment.success',
        subject: result.events[0].subject,
        source: 'com.number.increment',
        to: 'arvo.orc.test',
        data: {
          newValue: 1,
        },
      }),
    });

    expect(result.events.length).toBe(2);
    expect(result.subject).toBe(eventSubject);
    expect(result.parentSubject).toBe(null);
    expect(result.events[0].type).toBe('notif.number.update');
    expect(result.events[0].to).toBe('notif.number.update');
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.events[0].data.type).toBe('increment');
    expect(result.events[0].data.delta).toBe(1);

    expect(result.events[1].type).toBe('arvo.orc.test.done');
    expect(result.events[1].to).toBe('com.test.service');
    expect(result.events[1].subject).toBe(eventSubject);
    expect(result.events[1].source).toBe('arvo.orc.test');
    expect(result.events[1].data.final).toBe(1);
  });

  test('should have a complete successfull child orchestration', () => {
    const parentSubject = ArvoOrchestrationSubject.new({
      orchestator: 'com.test.service',
      version: '1.0.0',
      initiator: 'com.test.saad',
    });

    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '1.0.0',
      initiator: 'com.test.service',
    });

    let result = orchestrator.execute({
      parentSubject: parentSubject,
      event: createArvoEventFactory(testMachineContract).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: parentSubject,
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('com.number.increment');
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.subject).toBe(eventSubject);
    expect(result.parentSubject).toBe(parentSubject);
    expect(result.events[0].to).toBe('com.number.increment');
    expect(result.events[0].data.delta).toBe(1);
    expect(result.state).toBeDefined();

    result = orchestrator.execute({
      parentSubject: result.parentSubject,
      state: result.state,
      event: createArvoEventFactory(incrementServiceContract).emits({
        type: 'evt.number.increment.success',
        subject: result.events[0].subject,
        source: 'com.number.increment',
        to: 'arvo.orc.test',
        data: {
          newValue: 1,
        },
      }),
    });

    expect(result.events.length).toBe(2);
    expect(result.subject).toBe(eventSubject);
    expect(result.parentSubject).toBe(parentSubject);
    expect(result.events[0].type).toBe('notif.number.update');
    expect(result.events[0].to).toBe('notif.number.update');
    expect(result.events[0].subject).toBe(eventSubject);
    expect(result.events[0].data.type).toBe('increment');
    expect(result.events[0].data.delta).toBe(1);

    expect(result.events[1].type).toBe('arvo.orc.test.done');
    expect(result.events[1].to).toBe('com.test.service');
    expect(result.events[1].subject).toBe(parentSubject);
    expect(result.events[1].source).toBe('arvo.orc.test');
    expect(result.events[1].data.final).toBe(1);

    console.log(result.snapshot);
  });
});
