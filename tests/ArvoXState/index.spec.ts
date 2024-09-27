import { setupArvoMachine, ArvoMachineContext, ArvoActor } from '../../src';
import { createActor, emit } from 'xstate';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { number, z } from 'zod';
import { createArvoContract, createArvoOrchestratorContract } from 'arvo-core';

describe('ArvoXState', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });


  describe('setup', () => {
    it('should create a valid machine setup', () => {
      const setup = setupArvoMachine({
        contracts: {
          self: createArvoOrchestratorContract({
            uri: '#/test/orch',
            name: 'test',
            schema: {
              init: z.object({}),
              complete: z.object({})
            }
          }),
          services: {
            notification: createArvoContract({
              uri: '#/test/service',
              accepts: {
                type: 'notif.number.change',
                schema: z.object({
                  num: z.number()
                })
              },
              emits: {
                'evt.number.change.success': z.object({
                  success: z.boolean()
                })
              }
            })
          }
        },
        types: {} as {
          context: { count: number };
          events: { type: 'INCREMENT' | 'DECREMENT' };
        },
        actions: {
          increment: ({ context }) => ({ count: context.count + 1 }),
          decrement: ({ context }) => ({ count: context.count - 1 }),
          emitEvent: emit(({context}) => ({
            type: 'notif.number.change',
            data: {
              num: context.count
            }
          }))
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
    it('should create a valid machine', () => {
      const { createMachine } = setupArvoMachine({
        contracts: {
          self: createArvoOrchestratorContract({
            uri: '#/test/orch',
            name: 'test',
            schema: {
              init: z.object({}),
              complete: z.object({})
            }
          }),
          services: {
            notification: createArvoContract({
              uri: '#/test/service',
              accepts: {
                type: 'notif.number.change',
                schema: z.object({
                  num: z.number()
                })
              },
              emits: {
                'evt.number.change.success': z.object({
                  success: z.boolean()
                })
              }
            })
          }
        },
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
      const { createMachine } = ArvoXState.machine.setupArvoMachine({
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
      const { createMachine } = ArvoXState.machine.setupArvoMachine({
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

      const inputSchema = z.object({
        name: z.string()
      })

      const outputSchema = z.any()

      const machine = ArvoXState.machine.setupArvoMachine({
        types: {
          input: {} as z.infer<typeof inputSchema>,
          output: {} as z.infer<typeof outputSchema>,
          context: {} as {},
          events: {} as { type: 'EMIT' },
        },
      }).createMachine({
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

      const a = new ArvoActor({
        init: {
          type: 'com.test.actor',
          schema: inputSchema
        },
        complete: {
          type: 'com.test.actor',
          schema: outputSchema
        },
        machines: [machine]
      })

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
