import { createArvoOrchestratorEventFactory } from 'arvo-core';
import { createSimpleEventBroker, SimpleMachineMemory } from '../../src';
import { decrementNumberHandler } from '../ArvoOrchestrator/handler/decrement.number';
import { incrementNumberHandler } from '../ArvoOrchestrator/handler/increment.number';
import { valueReadHandler } from '../ArvoOrchestrator/handler/value.read';
import { valueWriteHandler } from '../ArvoOrchestrator/handler/value.write';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { decrementResumable } from './resumables/decrement';
import {
  decrementContract,
  decrementOrchestratorContract,
  valueReadContract,
  valueWriteContract,
} from '../ArvoOrchestrator/contracts';
import { incrementResumable } from './resumables/increment';
import { incrementResumableContact } from './contracts/increment.resumable';

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
  const machineMemory = new SimpleMachineMemory();

  const handlers = {
    decrement: decrementNumberHandler(),
    increment: incrementNumberHandler(),
    valueRead: valueReadHandler({ valueStore }),
    valueWrite: valueWriteHandler({ valueStore }),
    decrementAgent: decrementResumable({ memory: machineMemory }),
    incrementAgent: incrementResumable({ memory: machineMemory }),
  };

  it('should orchestrate valid init event', async () => {
    const initEvent = createArvoOrchestratorEventFactory(decrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        key: 'test.key',
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
      },
    });

    valueStore[initEvent.data.key] = 2;
    let events = await handlers.decrementAgent.execute(initEvent, {
      inheritFrom: 'EVENT',
    });
    let context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('active');
    expect((context?.state$$ as any)?.value).toBe(0);
    expect((context?.state$$ as any)?.modifier).toBe(2);
    expect((context?.state$$ as any)?.trend).toBe('linear');
    expect((context?.state$$ as any)?.error.length).toBe(0);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe(valueReadContract.type);
    expect(events.events[0].to).toBe(valueReadContract.type);
    expect(events.events[0].source).toBe(decrementOrchestratorContract.type);
    expect(events.events[0].data.key).toBe(initEvent.data.key);
    console.log(initEvent, events.events[0]);
    expect(events.events[0].parentid).toBe(initEvent.id);

    await promiseTimeout();
    let eventToUse = events.events[0];
    events = await handlers.valueRead.execute(eventToUse, {
      inheritFrom: 'EVENT',
    });

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe('evt.value.read.success');
    expect(events.events[0].to).toBe(decrementOrchestratorContract.type);
    expect(events.events[0].source).toBe(valueReadContract.type);
    expect(events.events[0].data.value).toBe(valueStore[initEvent.data.key]);
    expect(events.events[0].parentid).toBe(eventToUse.id);

    await promiseTimeout();
    eventToUse = events.events[0];
    events = await handlers.decrementAgent.execute(eventToUse, {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('active');
    expect((context?.state$$ as any)?.value).toBe(2);
    expect((context?.state$$ as any)?.modifier).toBe(2);
    expect((context?.state$$ as any)?.trend).toBe('linear');
    expect((context?.state$$ as any)?.error.length).toBe(0);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe(decrementContract.type);
    expect(events.events[0].to).toBe(decrementContract.type);
    expect(events.events[0].source).toBe(decrementOrchestratorContract.type);
    expect(events.events[0].data.init).toBe(2);
    expect(events.events[0].data.decrement).toBe(2);

    await promiseTimeout();
    events = await handlers.decrement.execute(events.events[0], {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(events.events.length).toBe(1);
    expect(events.events[0].type).toBe('evt.decrement.number.success');
    expect(events.events[0].to).toBe(decrementOrchestratorContract.type);
    expect(events.events[0].source).toBe(decrementContract.type);
    expect(events.events[0].data.result).toBe(0);

    await promiseTimeout();
    eventToUse = events.events[0];
    events = await handlers.decrementAgent.execute(eventToUse, {
      inheritFrom: 'EVENT',
    });
    context = await machineMemory.read(initEvent.subject);

    expect(context?.subject).toBe(initEvent.subject);
    expect(context?.parentSubject).toBe(null);
    expect(context?.status).toBe('done');
    expect((context?.state$$ as any)?.value).toBe(0);
    expect((context?.state$$ as any)?.modifier).toBe(2);
    expect((context?.state$$ as any)?.trend).toBe('linear');
    expect((context?.state$$ as any)?.error.length).toBe(0);

    expect(events.events.length).toBe(2);
    expect(events.events[0].type).toBe(decrementOrchestratorContract.metadata.completeEventType);
    expect(events.events[0].to).toBe('com.test.test');
    expect(events.events[0].source).toBe(decrementOrchestratorContract.type);
    expect(events.events[0].data.success).toBe(true);
    expect(events.events[0].data.error.length).toBe(0);
    expect(events.events[0].data.final).toBe(0);
    expect(events.events[0].parentid).toBe(initEvent.id);

    expect(events.events[1].type).toBe(valueWriteContract.type);
    expect(events.events[1].to).toBe(valueWriteContract.type);
    expect(events.events[1].source).toBe(decrementOrchestratorContract.type);
    expect(events.events[1].data.key).toBe(initEvent.data.key);
    expect(events.events[1].data.value).toBe(0);
    expect(events.events[1].parentid).toBe(eventToUse.id);
  });

  it('should orchestrate valid init events for dynamic branch resumable', async () => {
    valueStore['test.1'] = 3;
    valueStore['test.2'] = 8;

    const { resolve } = createSimpleEventBroker(Object.values(handlers));
    const initEvent = createArvoOrchestratorEventFactory(incrementResumableContact.version('0.0.1')).accepts({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        modifications: [
          {
            key: 'test.1',
            value: 1,
          },
          {
            key: 'test.2',
            value: 2,
          },
        ],
      },
    });

    const resolvedEvent = await resolve(initEvent);

    expect(valueStore['test.1']).toBe(4);
    expect(valueStore['test.2']).toBe(10);

    expect(resolvedEvent?.type).toBe(incrementResumableContact.version('0.0.1').metadata.completeEventType);
    expect(resolvedEvent?.data?.final?.[0]?.key).toBe('test.1');
    expect(resolvedEvent?.data?.final?.[0]?.value).toBe(4);
    expect(resolvedEvent?.data?.final?.[1]?.key).toBe('test.2');
    expect(resolvedEvent?.data?.final?.[1]?.value).toBe(10);
    expect(resolvedEvent?.parentid).toBe(initEvent.id);
  });

  it('should throw execution errors', async () => {
    const { resolve } = createSimpleEventBroker(Object.values(handlers));
    const initEvent = createArvoOrchestratorEventFactory(decrementOrchestratorContract.version('0.0.2')).init({
      source: 'com.test.test',
      data: {
        key: 'test.key',
        modifier: 2,
        trend: 'exponential',
        parentSubject$$: null,
      },
    });
    const resolvedEvent = await resolve(initEvent);

    expect(resolvedEvent?.subject).toBe(initEvent.subject);
    expect(resolvedEvent?.type).toBe(decrementOrchestratorContract.systemError.type);
    expect(resolvedEvent?.data?.errorMessage).toBe('Version 0.0.2 is not implemented for decrement resumable');
    expect(resolvedEvent?.parentid).toBe(initEvent.id);
  });
});
