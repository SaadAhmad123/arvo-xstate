import { ArvoXState, ArvoMachineContext } from '../../src';
import { createActor } from 'xstate';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';

describe('ArvoXState', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  describe('setup', () => {
    it('should create a valid machine setup', () => {
      const setup = ArvoXState.machine.setup({
        types: {} as {
          context: { count: number };
          events: { type: 'INCREMENT' | 'DECREMENT' };
        },
        actions: {
          increment: ({ context }) => ({ count: context.count + 1 }),
          decrement: ({ context }) => ({ count: context.count - 1 }),
        },
        guards: {
          isPositive: ({ context }) => context.count > 0,
        },
      });

      expect(setup).toHaveProperty('createMachine');
      expect(typeof setup.createMachine).toBe('function');
    });

    it('should throw an error when using "actors" parameter', () => {
      expect(() => {
        ArvoXState.machine.setup({
          // @ts-ignore
          actors: {},
        });
      }).toThrow(/Unsupported 'actor' parameter/);
    });

    it('should throw an error when using "delays" parameter', () => {
      expect(() => {
        ArvoXState.machine.setup({
          // @ts-ignore
          delays: {},
        });
      }).toThrow(/Unsupported 'delays' parameter/);
    });

    it('should throw an error when using reserved action name "enqueueArvoEvent"', () => {
      expect(() => {
        ArvoXState.machine.setup({
          actions: {
            enqueueArvoEvent: () => {},
          },
        });
      }).toThrow(/Reserved action name 'enqueueArvoEvent'/);
    });
  });

  describe('createMachine', () => {
    it('should create a valid machine', () => {
      const { createMachine } = ArvoXState.machine.setup({
        types: {
          context: {} as { count: number },
          events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' },
        },
      });

      const machine = createMachine({
        version: '1.0.0',
        id: 'counter',
        context: { count: 0 },
        initial: 'idle',
        states: {
          idle: {
            on: {
              INCREMENT: {
                actions: [({ context }) => ({ count: context.count + 1 })],
              },
              DECREMENT: {
                actions: [({ context }) => ({ count: context.count - 1 })],
              },
            },
          },
        },
      });

      expect(machine).toBeDefined();
    });

    it('should throw an error when using "invoke" in machine config', () => {
      const { createMachine } = ArvoXState.machine.setup({
        types: {
          context: {} as { count: number },
          events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' },
        },
      });

      expect(() => {
        createMachine({
          version: '1.0.0',
          id: 'counter',
          context: { count: 0 },
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
      const { createMachine } = ArvoXState.machine.setup({
        types: {
          context: {} as { count: number },
          events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' },
        },
      });

      expect(() => {
        createMachine({
          version: '1.0.0',
          id: 'counter',
          context: { count: 0 },
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
  });

  describe('enqueueArvoEvent action', () => {
    it('should add an ArvoEvent to the eventQueue', () => {
      const { createMachine } = ArvoXState.machine.setup({
        types: {
          context: {} as {},
          events: {} as { type: 'EMIT' },
        },
      });
      const machine = createMachine({
        version: '1.0.0',
        id: 'emitter',
        context: {},
        initial: 'idle',
        states: {
          idle: {
            on: {
              EMIT: {
                actions: [
                  {
                    type: 'enqueueArvoEvent',
                    params: {
                      type: 'com.test.machine',
                      data: { message: 'Hello' },
                    },
                  },
                ],
              },
            },
          },
        },
      });

      const actor = createActor(machine);
      actor.start();
      actor.send({ type: 'EMIT' });

      const snapshot = actor.getSnapshot();
      expect(
        (snapshot.context as ArvoMachineContext).arvo$$?.volatile$$
          ?.eventQueue$$,
      ).toHaveLength(1);
      expect(
        (snapshot.context as ArvoMachineContext).arvo$$?.volatile$$
          ?.eventQueue$$?.[0],
      ).toEqual({
        type: 'com.test.machine',
        data: { message: 'Hello' },
      });
    });
  });
});
