import {
  ArvoErrorSchema,
  ArvoOrchestrationSubject,
  createArvoContract,
  createArvoEventFactory,
  createArvoOrchestratorContract,
} from 'arvo-core';
import { z } from 'zod';
import {
  createArvoOrchestrator,
  emittableOrchestratorEvent,
  setupArvoMachine,
} from '../../src';
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
    type: 'test',
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
      '0.0.2': {
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

  const setupV001 = setupArvoMachine({
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

  const setupV002 = setupArvoMachine({
    contracts: {
      self: testMachineContract.version('0.0.2'),
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

  const machineV001 = setupV001.createMachine({
    id: 'counter',
    context: ({ input }) => ({
      ...input.data,
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

  const machineV002 = setupV002.createMachine({
    id: 'counter',
    context: ({ input }) => ({
      ...input.data,
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

  const orchestrator = createArvoOrchestrator({
    contract: testMachineContract,
    executionunits: 1,
    machines: {
      '0.0.1': machineV001,
      '0.0.2': machineV002,
    },
  });

  test('should initialize correctly', () => {
    expect(orchestrator.source).toBe(testMachineContract.type);
    expect(orchestrator.executionunits).toBe(1);
    expect(Object.values(orchestrator.machines)).toHaveLength(2);
    expect(orchestrator.machines['0.0.1']).toBe(machineV001);
  });

  test('should throw error if no machines are provided', () => {
    expect(() =>
      createArvoOrchestrator({
        contract: testMachineContract,
        executionunits: 1,
        machines: {} as any,
      }),
    ).toThrow();
  });

  test('should execute increment successfully', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '0.0.1',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(
        testMachineContract.version('0.0.1'),
      ).accepts({
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
    expect(result.events[0].dataschema).toBe(
      `${incrementServiceContract.uri}/0.0.1`,
    );
    expect(result.state).toBeDefined();
    expect(result.parentSubject).toBe(null);
    expect(result.subject).toBe(eventSubject);
  });

  test('should handle errors successfully', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '0.0.2',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: 'testsubject',
      event: createArvoEventFactory(
        testMachineContract.version('0.0.2'),
      ).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: 'testsubject',
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.events[0].subject).toBe('testsubject');
    expect(result.events[0].to).toBe('com.test.service');
    expect(result.events[0].data.errorMessage).toBe(
      "The emitted event (type=com.number.increment.1) does not correspond to a contract. If this is delibrate, the use the action 'enqueueArvoEvent' instead of the 'emit'",
    );
    expect(result.state).toBe(null);
  });

  test('should handle errors successfully: No machine found', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '0.0.3',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: 'testsubject',
      event: createArvoEventFactory(
        testMachineContract.version('0.0.2'),
      ).accepts({
        source: 'com.test.service',
        subject: eventSubject,
        data: {
          parentSubject$$: 'testsubject',
          type: 'increment',
          delta: 1,
        },
      }),
      state: null,
    });

    expect(result.executionStatus).toBe('error');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe(testMachineContract.systemError.type);
    expect(result.events[0].subject).toBe('testsubject');
    expect(result.events[0].to).toBe('com.test.service');
    expect(result.events[0].data.errorMessage).toBe(
      "Unsupported version: No machine found for orchestrator arvo.orc.test with version '0.0.3'. Please check the supported versions and update your request.",
    );
    expect(result.state).toBe(null);
  });

  test('should handle errors when wrong event.to is defined', () => {
    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '0.0.2',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(
        testMachineContract.version('0.0.2'),
      ).accepts({
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
      version: '0.0.2',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(
        testMachineContract.version('0.0.2'),
      ).accepts({
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
      version: '0.0.1',
      initiator: 'com.test.service',
    });

    const result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(
        incrementServiceContract.version('0.0.1'),
      ).accepts({
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
      version: '0.0.1',
      initiator: 'com.test.service',
    });

    let result = orchestrator.execute({
      parentSubject: null,
      event: createArvoEventFactory(
        testMachineContract.version('0.0.1'),
      ).accepts({
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
      event: createArvoEventFactory(
        incrementServiceContract.version('0.0.1'),
      ).emits({
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
      version: '0.0.1',
      initiator: 'com.test.saad',
    });

    const eventSubject = ArvoOrchestrationSubject.new({
      orchestator: 'arvo.orc.test',
      version: '0.0.1',
      initiator: 'com.test.service',
    });

    let result = orchestrator.execute({
      parentSubject: parentSubject,
      event: createArvoEventFactory(
        testMachineContract.version('0.0.1'),
      ).accepts({
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
      event: createArvoEventFactory(
        incrementServiceContract.version('0.0.1'),
      ).emits({
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
    expect(result.events[1].dataschema).toBe(
      `${testMachineContract.uri}/0.0.1`,
    );
    expect(result.events[1].data.final).toBe(1);
  });
});
