import {
  type ArvoEvent,
  ArvoOrchestrationSubject,
  EventDataschemaUtil,
  createArvoEvent,
  createArvoEventFactory,
  createArvoOrchestratorContract,
  createArvoOrchestratorEventFactory,
} from 'arvo-core';
import { ExecutionViolation } from 'arvo-event-handler';
import { z } from 'zod';
import {
  type ArvoOrchestrator,
  type MachineMemoryRecord,
  SimpleMachineMemory,
  createArvoOrchestrator,
  createSimpleEventBroker,
  setupArvoMachine,
} from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import {
  decrementOrchestratorContract,
  incrementContract,
  incrementOrchestratorContract,
  numberModifierOrchestrator as numberModifierOrchestratorContract,
  valueReadContract,
} from './contracts';
import { decrementNumberHandler } from './handler/decrement.number';
import { incrementNumberHandler } from './handler/increment.number';
import { valueReadHandler } from './handler/value.read';
import { valueWriteHandler } from './handler/value.write';
import { decrementOrchestrator } from './orchestrators/decrement';
import { incrementOrchestrator } from './orchestrators/increment';
import { numberModifierOrchestrator } from './orchestrators/number.modifier';

const promiseTimeout = (timeout = 10) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, timeout);
  });

describe('ArvoOrchestrator', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const valueStore: Record<string, number> = {};
  const machineMemory = new SimpleMachineMemory<MachineMemoryRecord>();

  const handlers = {
    increment: incrementNumberHandler(),
    decrement: decrementNumberHandler(),
    valueRead: valueReadHandler({ valueStore }),
    valueWrite: valueWriteHandler({ valueStore }),
    incrementAgent: incrementOrchestrator({ memory: machineMemory }),
    decrementAgent: decrementOrchestrator({ memory: machineMemory }),
    numberModifierAgent: numberModifierOrchestrator({ memory: machineMemory }),
  };

  it('should orchestrate valid init event', async () => {
    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        key: 'test.key',
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    valueStore[initEvent.data.key] = 2;
    let events = await handlers.incrementAgent.execute(initEvent, {
      inheritFrom: 'EVENT',
    });
    let context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('active');
    expect(context?.value).toBe('fetch_value');
    expect((context?.state as any)?.context.value).toBe(0);
    expect((context?.state as any)?.context.modifier).toBe(2);
    expect((context?.state as any)?.context.trend).toBe('linear');
    expect((context?.state as any)?.context.error.length).toBe(0);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe(valueReadContract.type);
    expect(events.events[0].to).toBe(valueReadContract.type);
    expect(events.events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events.events[0].data.key).toBe(initEvent.data.key);

    await promiseTimeout();
    events = await handlers.valueRead.execute(events.events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe('evt.value.read.success');
    expect(events.events[0].to).toBe(incrementOrchestratorContract.type);
    expect(events.events[0].source).toBe(valueReadContract.type);
    expect(events.events[0].data.value).toBe(valueStore[initEvent.data.key]);

    await promiseTimeout();
    events = await handlers.incrementAgent.execute(events.events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('active');
    expect(JSON.stringify(context?.value ?? {})).toBe(JSON.stringify({ increment: {} }));
    expect((context?.state as any)?.context.value).toBe(2);
    expect((context?.state as any)?.context.modifier).toBe(2);
    expect((context?.state as any)?.context.trend).toBe('linear');
    expect((context?.state as any)?.context.error.length).toBe(0);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe(incrementContract.type);
    expect(events.events[0].to).toBe(incrementContract.type);
    expect(events.events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events.events[0].data.init).toBe(2);
    expect(events.events[0].data.increment).toBe(2);

    await promiseTimeout();
    events = await handlers.increment.execute(events.events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe('evt.increment.number.success');
    expect(events.events[0].to).toBe(incrementOrchestratorContract.type);
    expect(events.events[0].source).toBe(incrementContract.type);
    expect(events.events[0].data.result).toBe(4);

    await promiseTimeout();
    events = await handlers.incrementAgent.execute(events.events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('done');
    expect(context?.value).toBe('done');
    expect((context?.state as any)?.context.value).toBe(4);
    expect((context?.state as any)?.context.modifier).toBe(2);
    expect((context?.state as any)?.context.trend).toBe('linear');
    expect((context?.state as any)?.context.error.length).toBe(0);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe(incrementOrchestratorContract.metadata.completeEventType);
    expect(events.events[0].to).toBe('com.test.test');
    expect(events.events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events.events[0].data.success).toBe(true);
    expect(events.events[0].data.error.length).toBe(0);
    expect(events.events[0].data.final).toBe(4);
  });

  it('should throw error if lock not acquired', async () => {
    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        key: 'test.key',
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    await machineMemory.lock(initEvent.subject);

    expect(async () => {
      await handlers.incrementAgent.execute(initEvent, {
        inheritFrom: 'EVENT',
      });
    }).rejects.toThrow('Lock acquisition denied - Unable to obtain exclusive access to event processing');

    const result = await machineMemory.lock(initEvent.subject);
    expect(result).toBe(false);
  });

  it('should throw error if contract unresolved', async () => {
    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        key: 'test.key',
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    let events = await handlers.incrementAgent.execute(initEvent, {
      inheritFrom: 'EVENT',
    });

    await expect(async () => {
      events = await handlers.incrementAgent.execute(events.events[0], {
        inheritFrom: 'EVENT',
      });
    }).rejects.toThrow(
      'ViolationError<Config> Contract validation failed - Event does not match any registered contract schemas in the machine',
    );

    expect(await machineMemory.lock(initEvent.subject)).toBe(true);
    expect(await machineMemory.unlock(initEvent.subject)).toBe(true);

    const fetchEvent = createArvoEvent({
      subject: initEvent.subject,
      source: 'com.test.test',
      type: 'evt.value.read.success',
      data: {
        value: 'saad' as any,
      },
      dataschema: EventDataschemaUtil.create(valueReadContract.version('0.0.1')),
    });

    expect(async () => {
      events = await handlers.incrementAgent.execute(fetchEvent, {
        inheritFrom: 'EVENT',
      });
    }).rejects.toThrow(
      'ViolationError<Contract> Input validation failed - Event data does not meet contract requirements',
    );
  });

  it('should conducting nested orchestrators', async () => {
    const broker = createSimpleEventBroker(Object.values(handlers));
    let finalEvent: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEvent = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'linear',
        operation: 'decrement',
        parentSubject$$: null,
      },
    });

    await broker.publish(initEvent);
    expect(finalEvent).not.toBe(null);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEvent!.to).toBe('com.test.test');
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEvent!.data.success).toBe(true);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEvent!.data.error.length).toBe(0);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEvent!.data.final).toBe(-3);
    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init decrement orchestrator event
        1 + // Notification event
        1 + // Read event
        1 + // Read success event
        1 + // Decrement event
        1 + // Decrement success event
        1 + // Decrement orchestrator completion event
        1, // Number modifier orchestrator completion event
    );

    expect(broker.events[0].type).toBe('arvo.orc.number.modifier');
    expect(broker.events[0].to).toBe('arvo.orc.number.modifier');

    expect(broker.events[1].type).toBe('com.value.write');
    expect(broker.events[1].to).toBe('com.value.write');
    expect(broker.events[1].subject).toBe(initEvent.subject);
    expect(broker.events[1].data.key).toBe(initEvent.subject);
    expect(broker.events[1].data.value).toBe(initEvent.data.init);

    expect(broker.events[3].type).toBe('arvo.orc.dec');
    expect(broker.events[3].data.parentSubject$$).toBe(initEvent.subject);
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).orchestrator.name).toBe('arvo.orc.dec');
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).orchestrator.version).toBe('0.0.1');
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).execution.initiator).toBe(
      'arvo.orc.number.modifier',
    );

    const badEvent = createArvoEvent({
      source: 'com.test.test',
      subject: 'test',
      data: {},
      type: numberModifierOrchestratorContract.type,
    });
    expect(async () => {
      await handlers.numberModifierAgent.execute(badEvent, {
        inheritFrom: 'EVENT',
      });
    }).rejects.toThrow(
      `ViolationError<Execution> Invalid event (id=${badEvent.id}) subject format. Expected an ArvoOrchestrationSubject but received 'test'. The subject must follow the format specified by ArvoOrchestrationSubject schema`,
    );
  });

  it('should throw error on different mahines', () => {
    expect(() => {
      createArvoOrchestrator({
        executionunits: 0.1,
        memory: new SimpleMachineMemory(),
        machines: [
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
          ...(handlers.decrementAgent as ArvoOrchestrator).registry.machines,
        ],
      });
    }).toThrow("All the machines in the orchestrator must have type 'arvo.orc.inc'");
  });

  it('should throw error on duplicate mahines', () => {
    expect(() => {
      createArvoOrchestrator({
        executionunits: 0.1,
        memory: new SimpleMachineMemory(),
        machines: [
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
        ],
      });
    }).toThrow(
      'An orchestrator must have unique machine versions. Machine ID:machineV001 has duplicate version 0.0.1.',
    );
  });

  it('should throw error on execute in case of faulty locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => null,
        write: async (id: string, data: MachineMemoryRecord) => {},
        lock: async (id: string) => {
          throw new Error('Locking system failure!');
        },
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error acquiring lock for event (subject=${initEvent.subject}): Locking system failure!`,
    );
  });

  it('should throw error on execute in case of faulty reading locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => {
          throw new Error('Failed to acquire memory');
        },
        write: async (id: string, data: MachineMemoryRecord) => {},
        lock: async (id: string) => true,
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error reading state for event (subject=${initEvent.subject}): Failed to acquire memory`,
    );
  });

  it('should throw error on execute in case of faulty writing locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => null,
        write: async (id: string, data: MachineMemoryRecord) => {
          throw new Error('Failed to write memory');
        },
        lock: async (id: string) => true,
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error writing state for event (subject=${initEvent.subject}): Failed to write memory`,
    );
  });

  it('should redirect the completion event to a different location', async () => {
    const broker = createSimpleEventBroker(Object.values(handlers));
    let finalEventFromTest: ArvoEvent | null = null;
    let finalEventFromTest1: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });
    broker.subscribe('com.test.test.1', async (event) => {
      finalEventFromTest1 = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'linear',
        operation: 'decrement',
        parentSubject$$: null,
      },
      redirectto: 'com.test.test.1',
    });

    await broker.publish(initEvent);

    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init decrement orchestrator event
        1 + // Notification event
        1 + // Read event
        1 + // Read success event
        1 + // Decrement event
        1 + // Decrement success event
        1 + // Decrement orchestrator completion event
        1, // Number modifier orchestrator completion event
    );
    const state = await machineMemory.read(initEvent.subject);

    expect(state?.initEventId).toBe(initEvent.id);
    expect(initEvent.id).toBe(broker.events[broker.events.length - 1].parentid);
    expect(initEvent.id).not.toBe(broker.events[broker.events.length - 2].parentid);
    expect(finalEventFromTest).toBe(null);
    expect(finalEventFromTest1).not.toBe(null);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEventFromTest1!.to).toBe('com.test.test.1');
  });

  it('should throw error event in case of faulty parent subject', async () => {
    let brokerError: Error | null = null;
    const broker = createSimpleEventBroker(Object.values(handlers), {
      onError: (error) => {
        brokerError = error;
      },
    });
    let finalEventFromTest: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.2')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'exponential',
        operation: 'decrement',
        parentSubject$$: null,
      },
      redirectto: 'com.test.test.1',
    });

    await broker.publish(initEvent);

    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        0, // Faulty parent subject will raise an ExecutionViolation
    );

    // Error thrown on final event
    expect(finalEventFromTest).toBe(null);

    expect(brokerError).toBeDefined();
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect((brokerError! as ExecutionViolation).name).toBe('ViolationError<Execution>');
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect((brokerError! as ExecutionViolation).message).toBe(
      'ViolationError<Execution> Invalid parentSubject$$ for the ' +
        "event(type='arvo.orc.dec', uri='#/test/orchestrator/decrement/0.0.2').It must be follow " +
        'the ArvoOrchestrationSubject schema. The easiest way is to use the current orchestration ' +
        'subject by storing the subject via the context block in the machine definition.',
    );
  });

  it('should redirect the completion event to a different location', async () => {
    const broker = createSimpleEventBroker(Object.values(handlers));
    let finalEventFromTest: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.2')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'exponential',
        operation: 'increment',
        parentSubject$$: null,
      },
    });

    await broker.publish(initEvent);
    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init increment orchestrator event
        1 + // Init increment orchestrator event with out parent subject
        1 + // Read event
        1 + // Read success event
        1 + // Increment event
        1 + // Increment success event 1
        1 + // Increment success event 2
        1 + // Increment orchestrator completion event
        1 + // Number modifier orchestrator completion event
        1 + // Read event
        1 + // Read success event
        1 + // Increment event
        1 + // Increment success event 1
        1 + // Increment success event 2
        1, // Increment orchestrator completion event
    );
    expect(finalEventFromTest).not.toBe(null);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEventFromTest!.to).toBe('com.test.test');
  });

  it('shoud not emit any event on a non init event with no state', async () => {
    const subject = ArvoOrchestrationSubject.new({
      initiator: 'com.test.test',
      orchestator: incrementOrchestratorContract.version('0.0.1').accepts.type,
      version: incrementOrchestratorContract.version('0.0.1').version,
    });

    const event = createArvoEventFactory(incrementContract.version('0.0.1')).emits({
      subject: subject,
      source: 'com.test.test',
      type: 'evt.increment.number.success',
      data: {
        result: 12,
      },
    });

    const events = await handlers.incrementAgent.execute(event, { inheritFrom: 'EVENT' });

    expect(events.events.length).toBe(0);
  });

  it('should have system error schema which is standard', () => {
    expect(handlers.decrementAgent.systemErrorSchema.type).toBe(decrementOrchestratorContract.systemError.type);
  });

  it('should throw violation if the event is looking for a different machine version', () => {
    const corruptSubject = ArvoOrchestrationSubject.new({
      orchestator: incrementOrchestratorContract.type,
      initiator: 'com.test.test',
      version: '1.0.0',
    });
    const event = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      subject: corruptSubject,
      source: 'com.test.test',
      data: {
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
        key: 'string',
      },
    });

    expect(() => handlers.incrementAgent.execute(event, { inheritFrom: 'EVENT' })).rejects.toThrow(
      "ViolationError<Config> Machine resolution failed: No machine found matching orchestrator name='arvo.orc.inc' and version='1.0.0'.",
    );
  });

  it('should throw error event on non violations. Such as when machine internally throws error', async () => {
    const dumbOrchestratorContract = createArvoOrchestratorContract({
      uri: '#/test/dumb',
      name: 'dumb',
      versions: {
        '1.0.0': {
          init: z.object({
            error_type: z.enum(['violation', 'normal']),
          }),
          complete: z.object({}),
        },
      },
    });

    const machineId = 'machineV100';
    const dumbMachine = setupArvoMachine({
      contracts: {
        self: dumbOrchestratorContract.version('1.0.0'),
        services: {},
      },
      types: {
        context: {} as {
          error_type: 'violation' | 'normal';
        },
      },
      actions: {
        throwNormalError: () => {
          throw new Error('Normal error');
        },
        throwViolationError: () => {
          throw new ExecutionViolation('Violation error');
        },
      },
    }).createMachine({
      /** @xstate-layout N4IgpgJg5mDOIC5QFsCGBjAFgSwHZgDUBGABhIDoAnAewFcAXMSgYgG0SBdRUAB2tmz1s1XNxAAPREQCsFAMxEATABYA7AE5NADnXSAbFoA0IAJ6JFqueRWble2Xb1FVAXxfG0WPIVIUaDJjYiLiQQPgEhETFJBBl5JTVNdR19I1MpEj1yVWVtOTkc1RVlRTcPDBx8YjIqOkYWVkUQ3n5BYVFQmLjyBRUNbV0DYzNYnXIk9T1cuUn1BTKQT0qfGtxqSjQAGwB9JhoGzjFwtqjOxH0icaSnTJn1RXVh8yLyXNtVTKnVIjsFpe9qhQAG7CTaoSK4XaUfZsQ6hY4Q6LnJxXTQ3PR3B5PWIkaSo5IzOT2OTKGRudwgNYQOBif5VXxHVqIs4IAC0emxrLxEx5PLkfwqAN8tQClEZEXaSIQJWxRB+5D0Ni0ckUin0ihmpQpdJWFDWG1QOz263FJw6oBiCnU1iIWiKMjkuJm0mU2L6+Kc9i0qS0WgFXnpNRB1DBEKh+1NzItiAUqnIMkVihIRDmJDtHPSCC0lze2mkii0GJk0n9y0B5AgIjAkclLNj8fVSZTjvTssLHvuMhK6mUpaFNWNYvhTNr0YQ9jjJDm32Uyi0ikVk1lcteRD0xNxqnsmRL5KAA */
      id: machineId,
      initial: 'router',
      context: ({ input }) => ({
        error_type: input.data.error_type,
      }),
      states: {
        router: {
          always: [
            {
              target: 'normal_error',
              guard: ({ context }) => context.error_type === 'normal',
            },
            {
              target: 'violation_error',
              guard: ({ context }) => context.error_type === 'violation',
            },
            {
              target: 'done',
            },
          ],
        },
        normal_error: {
          entry: { type: 'throwNormalError' },
          always: {
            target: 'error',
          },
        },
        violation_error: {
          entry: { type: 'throwViolationError' },
          always: {
            target: 'error',
          },
        },
        done: {
          type: 'final',
        },
        error: {
          type: 'final',
        },
      },
    });
    const dumbOrchestrator = createArvoOrchestrator({
      executionunits: 1,
      memory: machineMemory,
      machines: [dumbMachine],
    });

    let event = createArvoEventFactory(dumbOrchestratorContract.version('1.0.0')).accepts({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        error_type: 'normal' as const,
      },
    });

    const results = await dumbOrchestrator.execute(event);

    expect(results.events.length).toBe(1);
    expect(results.events[0].type).toBe(dumbOrchestratorContract.systemError.type);
    expect(results.events[0].data.errorMessage).toBe('Normal error');
    expect(results.events[0].to).toBe('com.test.test');

    event = createArvoEventFactory(dumbOrchestratorContract.version('1.0.0')).accepts({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        error_type: 'violation' as const,
      },
    });

    expect(() => dumbOrchestrator.execute(event)).rejects.toThrow('ViolationError<Execution> Violation error');
  });

  describe('parentid support', () => {
    it('should set parentid correctly for orchestrator-emitted events', async () => {
      const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
        source: 'com.test.test',
        data: {
          key: 'test.key.parentid',
          modifier: 2,
          trend: 'linear',
          parentSubject$$: null,
        },
      });

      valueStore[initEvent.data.key] = 5;

      let events = await handlers.incrementAgent.execute(initEvent, {
        inheritFrom: 'EVENT',
      });

      expect(events.events.length).toBe(1);
      expect(events.events[0].type).toBe(valueReadContract.type);
      expect(events.events[0].parentid).toBe(initEvent.id);

      await promiseTimeout();
      const nextEvent = events.events[0];
      events = await handlers.valueRead.execute(nextEvent, {
        inheritFrom: 'EVENT',
      });

      expect(events.events.length).toBe(1);
      expect(events.events[0].type).toBe('evt.value.read.success');
      expect(events.events[0].parentid).toBe(nextEvent.id);

      const valueReadResponseEvent = events.events[0];
      await promiseTimeout();
      events = await handlers.incrementAgent.execute(valueReadResponseEvent, {
        inheritFrom: 'EVENT',
      });

      expect(events.events.length).toBe(1);
      expect(events.events[0].type).toBe(incrementContract.type);
      expect(events.events[0].parentid).toBe(valueReadResponseEvent.id);
    });
  });
});
