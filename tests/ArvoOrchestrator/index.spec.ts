import {
  type ArvoEvent,
  ArvoOrchestrationSubject,
  EventDataschemaUtil,
  createArvoEvent,
  createArvoEventFactory,
  createArvoOrchestratorEventFactory,
} from 'arvo-core';
import {
  type ArvoOrchestrator,
  type MachineMemoryRecord,
  SimpleMachineMemory,
  createArvoOrchestrator,
  createSimpleEventBroker,
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
  const machineMemory: SimpleMachineMemory = new SimpleMachineMemory();

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

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(valueReadContract.type);
    expect(events[0].to).toBe(valueReadContract.type);
    expect(events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events[0].data.key).toBe(initEvent.data.key);

    await promiseTimeout();
    events = await handlers.valueRead.execute(events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('evt.value.read.success');
    expect(events[0].to).toBe(incrementOrchestratorContract.type);
    expect(events[0].source).toBe(valueReadContract.type);
    expect(events[0].data.value).toBe(valueStore[initEvent.data.key]);

    await promiseTimeout();
    events = await handlers.incrementAgent.execute(events[0], {
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

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(incrementContract.type);
    expect(events[0].to).toBe(incrementContract.type);
    expect(events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events[0].data.init).toBe(2);
    expect(events[0].data.increment).toBe(2);

    await promiseTimeout();
    events = await handlers.increment.execute(events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('evt.increment.number.success');
    expect(events[0].to).toBe(incrementOrchestratorContract.type);
    expect(events[0].source).toBe(incrementContract.type);
    expect(events[0].data.result).toBe(4);

    await promiseTimeout();
    events = await handlers.incrementAgent.execute(events[0], {
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

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(incrementOrchestratorContract.metadata.completeEventType);
    expect(events[0].to).toBe('com.test.test');
    expect(events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events[0].data.success).toBe(true);
    expect(events[0].data.error.length).toBe(0);
    expect(events[0].data.final).toBe(4);
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

    events = await handlers.incrementAgent.execute(events[0], {
      inheritFrom: 'EVENT',
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(incrementOrchestratorContract.systemError.type);
    expect(events[0].data.errorMessage).toBe(
      'Contract validation failed - Event does not match any registered contract schemas in the machine',
    );
    expect(events[0].to).toBe('com.test.test');

    const fetchEvent = createArvoEvent({
      subject: initEvent.subject,
      source: 'com.test.test',
      type: 'evt.value.read.success',
      data: {
        value: 'saad' as any,
      },
      dataschema: EventDataschemaUtil.create(valueReadContract.version('0.0.1')),
    });

    events = await handlers.incrementAgent.execute(fetchEvent, {
      inheritFrom: 'EVENT',
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(incrementOrchestratorContract.systemError.type);
    expect(
      (events[0].data.errorMessage as string).includes(
        'Input validation failed - Event data does not meet contract requirements:',
      ),
    ).toBe(true);
    expect(events[0].to).toBe('com.test.test');

    expect(await machineMemory.lock(initEvent.subject)).toBe(true);
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
      `Invalid event (id=${badEvent.id}) subject format. Expected an ArvoOrchestrationSubject but received 'test'. The subject must follow the format specified by ArvoOrchestrationSubject schema. Parsing error: Error parsing orchestration subject string to the context.\nError -> incorrect header check\nsubject -> test`,
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
      `Error acquiring lock (id=${initEvent.subject}): Locking system failure!`,
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
      `Error reading state (id=${initEvent.subject}): Failed to acquire memory`,
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
      `Error writing state for event (id=${initEvent.subject}): Failed to write memory`,
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
    expect(finalEventFromTest).toBe(null);
    expect(finalEventFromTest1).not.toBe(null);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEventFromTest1!.to).toBe('com.test.test.1');
  });

  it('should throw error event in case of faulty parent subject', async () => {
    const broker = createSimpleEventBroker(Object.values(handlers));
    let finalEventFromTest: ArvoEvent | null = null;
    let finalEventFromTest1: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });
    broker.subscribe('com.test.test.1', async (event) => {
      finalEventFromTest1 = event;
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
        1, // Error event for faulty parent subject
    );
    expect(finalEventFromTest1).toBe(null);
    expect(finalEventFromTest).not.toBe(null);
    // biome-ignore  lint/style/noNonNullAssertion: non issue
    expect(finalEventFromTest!.to).toBe('com.test.test');
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

    expect(events.length).toBe(0);
  });

  it('should have system error schema which is standard', () => {
    expect(handlers.decrementAgent.systemErrorSchema.type).toBe(decrementOrchestratorContract.systemError.type);
  });
});
