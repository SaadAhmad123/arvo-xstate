import { assign, emit } from 'xstate';
import { setupArvoMachine } from '../../../../../src';
import { decrementContract, decrementOrchestratorContract, valueReadContract } from '../../../contracts';
import type { DecrementMachineContext } from '../types';

const machineId = 'machineV002';
export const machineV002 = setupArvoMachine({
  contracts: {
    self: decrementOrchestratorContract.version('0.0.2'),
    services: {
      valueReader: valueReadContract.version('0.0.1'),
      decrement: decrementContract.version('0.0.2'),
    },
  },
  types: {
    context: {} as DecrementMachineContext,
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCGBjAFgSwHZgDUAGIgRgDoAzMAFywH0A3VAGwFcwBiMRm859mHIAnMKgjlYbdOjiwA2kQC6iUAAcA9rGw1sG3KpAAPRACYS5AJwA2ABwB2ACyX7tt6ZsAaEAE9ElgFZyewCSIkdHUkdbUwBma1MAX0TvNCw8QhIKajpMJlYOTlgfWHJ0DWR+AqFRcXIwYWENYUUVJBBNbV19QxMEcyIrOycXNxivX0RY8ysPO1iiWyIA+Otk1IwcfGIycggwdFFkMFwabl49g6OTvlw2ZAAjBslpWVgFZUNOnT0Ddr7rERYsFnIFLKZTE4iJZSN4-AhbBRQZYXAtTLZrK5YusQGktpldvtDmBjqciiUyhVLsTSbd7k9hPVGs1Wl8tD8ev9EIDgSMwRCoTC4YhSPZ7ORHCtSKZSKQAo5rI57EQkjjcBp9vB2niMjtSGyur9eogALTWYUIM04nXbLJUWgMAQcA0cv6gPqOUwW0jQ4KmawBBKxQN2AKua2bXV2onXU4u7pu4yICKOYKI8yWRyxWxhwKOC2BCX2AOSkjRSW2bEpXGR227BpNYTxo1chCWX22LN2JYBGErL2TfpEcXQ6zB0IQ6yitbVm0EigQfRgZuc93+DtdtzLPvTb1AosBzFRUgONyWZLJIA */
  id: machineId,
  context: ({ input }) => ({
    key: input.data.key,
    value: 0,
    modifier: input.data.modifier,
    trend: input.data.trend,
    error: [],
  }),
  output: ({ context }) => ({
    success: !context.error.length,
    error: context.error,
    final: context.value,
  }),
  initial: 'fetch_value',
  states: {
    fetch_value: {
      entry: emit(({ context }) => ({
        type: 'com.value.read',
        data: {
          key: context.key,
        },
      })),
      on: {
        'evt.value.read.success': {
          actions: assign({ value: ({ event }) => event.data.value }),
          target: 'decrement',
        },
        'sys.com.value.read.error': {
          actions: assign({
            error: ({ context, event }) => [...context.error, event.data],
          }),
          target: 'error',
        },
      },
    },
    decrement: {
      entry: emit(({ context }) => ({
        type: 'com.decrement.number',
        data: {
          init: context.value,
          divider: context.modifier,
        },
      })),
      on: {
        'evt.decrement.number.success': {
          actions: assign({ value: ({ event }) => event.data.result }),
          target: 'done',
        },
        'sys.com.decrement.number.error': {
          actions: assign({
            error: ({ context, event }) => [...context.error, event.data],
          }),
          target: 'error',
        },
      },
    },
    error: {
      type: 'final',
    },
    done: {
      type: 'final',
    },
  },
});
