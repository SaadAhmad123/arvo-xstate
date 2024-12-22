import { SimpleMachineMemory, createSimpleEventBroker } from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { incrementNumberHandler } from './handler/increment.number';
import { decrementNumberHandler } from './handler/decrement.number';
import { valueReadHandler } from './handler/value.read';
import { valueWriteHandler } from './handler/value.write';
import { decrementOrchestrator } from './orchestrators/decrement';
import { incrementOrchestrator } from './orchestrators/increment';
import { numberModifierOrchestrator } from './orchestrators/number.modifier';
import {
  ArvoEvent,
  createArvoEvent,
  createArvoOrchestratorEventFactory,
  EventDataschemaUtil,
} from 'arvo-core';
import {
  incrementContract,
  incrementOrchestratorContract,
  valueReadContract,
  numberModifierOrchestrator as numberModifierOrchestratorContract,
} from './contracts';

const promiseTimeout = (timeout: number = 10) =>
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
    const initEvent = createArvoOrchestratorEventFactory(
      incrementOrchestratorContract.version('0.0.1'),
    ).init({
      source: 'com.test.test',
      data: {
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    valueStore[initEvent.subject] = 2;
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
    expect(events[0].data.key).toBe(initEvent.subject);

    await promiseTimeout();
    events = await handlers.valueRead.execute(events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('evt.value.read.success');
    expect(events[0].to).toBe(incrementOrchestratorContract.type);
    expect(events[0].source).toBe(valueReadContract.type);
    expect(events[0].data.value).toBe(valueStore[initEvent.subject]);

    await promiseTimeout();
    events = await handlers.incrementAgent.execute(events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('active');
    expect(context?.value).toBe('increment');
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
    expect(events[0].type).toBe(
      incrementOrchestratorContract.metadata.completeEventType,
    );
    expect(events[0].to).toBe('com.test.test');
    expect(events[0].source).toBe(incrementOrchestratorContract.type);
    expect(events[0].data.success).toBe(true);
    expect(events[0].data.error.length).toBe(0);
    expect(events[0].data.final).toBe(4);
  });

  it('should throw error if lock not acquired', async () => {
    const initEvent = createArvoOrchestratorEventFactory(
      incrementOrchestratorContract.version('0.0.1'),
    ).init({
      source: 'com.test.test',
      data: {
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    await machineMemory.lock(initEvent.subject);

    let events = await handlers.incrementAgent.execute(initEvent, {
      inheritFrom: 'EVENT',
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(incrementOrchestratorContract.systemError.type);
    expect(events[0].data.errorMessage).toBe(
      'Lock acquisition denied - Unable to obtain exclusive access to event processing',
    );
    expect(events[0].to).toBe(initEvent.source);

    const result = await machineMemory.lock(initEvent.subject);
    expect(result).toBe(false);
  });

  it('should throw error if contract unresolved', async () => {
    const initEvent = createArvoOrchestratorEventFactory(
      incrementOrchestratorContract.version('0.0.1'),
    ).init({
      source: 'com.test.test',
      data: {
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
      dataschema: EventDataschemaUtil.create(
        valueReadContract.version('0.0.1'),
      ),
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

    const initEvent = createArvoOrchestratorEventFactory(
      numberModifierOrchestratorContract.version('0.0.1'),
    ).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'linear',
        operation: 'increment',
        parentSubject$$: null,
      },
    });

    await broker.publish(initEvent);

    console.log({
      finalEvent,
      events: broker.events,
    });
  });
});
