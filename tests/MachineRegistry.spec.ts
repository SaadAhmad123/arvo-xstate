import { createArvoOrchestratorContract, createArvoOrchestratorEventFactory } from 'arvo-core';
import { z } from 'zod';
import { MachineRegistry, setupArvoMachine } from '../src';
import { telemetrySdkStart, telemetrySdkStop } from './utils';

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

  const testMachineContract2 = createArvoOrchestratorContract({
    uri: '#/test/machine/2',
    name: 'machine.2',
    versions: {
      '0.0.1': {
        init: z.object({}),
        complete: z.object({}),
      },
    },
  });

  const machine1 = setupArvoMachine({
    contracts: {
      self: testMachineContract.version('0.0.1'),
      services: {},
    },
  }).createMachine({
    id: 'v1',
    initial: 'route',
    states: {
      route: { type: 'final' },
    },
  });

  const machine2 = setupArvoMachine({
    contracts: {
      self: testMachineContract.version('0.0.2'),
      services: {},
    },
  }).createMachine({
    id: 'v1',
    initial: 'route',
    states: {
      route: { type: 'final' },
    },
  });

  const machine3 = setupArvoMachine({
    contracts: {
      self: testMachineContract2.version('0.0.1'),
      services: {},
    },
  }).createMachine({
    id: 'v1',
    initial: 'route',
    states: {
      route: { type: 'final' },
    },
  });

  it('should throw error on no machines', () => {
    expect(() => {
      new MachineRegistry();
    }).toThrow(
      'Machine registry initialization failed: No machines provided. At least one machine must be registered.',
    );
  });

  it('should resolve the required machine', () => {
    const registry = new MachineRegistry(machine1, machine2, machine3);

    let resolvedMachine = registry.resolve(
      createArvoOrchestratorEventFactory(testMachineContract.version('0.0.1')).init({
        source: 'com.test.test',
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 10,
        },
      }),
    );

    expect(resolvedMachine.source).toBe(testMachineContract.type);
    expect(resolvedMachine.contracts.self.version).toBe('0.0.1');

    resolvedMachine = registry.resolve(
      createArvoOrchestratorEventFactory(testMachineContract.version('0.0.2')).init({
        source: 'com.test.test',
        data: {
          parentSubject$$: null,
          type: 'increment',
          delta: 10,
        },
      }),
    );

    expect(resolvedMachine.source).toBe(testMachineContract.type);
    expect(resolvedMachine.contracts.self.version).toBe('0.0.2');

    resolvedMachine = registry.resolve(
      createArvoOrchestratorEventFactory(testMachineContract2.version('0.0.1')).init({
        source: 'com.test.test',
        data: {
          parentSubject$$: null,
        },
      }),
    );

    expect(resolvedMachine.source).toBe(testMachineContract2.type);
    expect(resolvedMachine.contracts.self.version).toBe('0.0.1');
  });

  it('should throw error while resolving', () => {
    const registry = new MachineRegistry(machine1, machine2);

    expect(() => {
      registry.resolve(
        createArvoOrchestratorEventFactory(testMachineContract2.version('0.0.1')).init({
          source: 'com.test.test',
          data: {
            parentSubject$$: null,
          },
        }),
        {
          inheritFrom: 'EVENT',
        },
      );
    }).toThrow(
      "Machine resolution failed: No machine found matching orchestrator name='arvo.orc.machine.2' and version='0.0.1'",
    );
  });
});
