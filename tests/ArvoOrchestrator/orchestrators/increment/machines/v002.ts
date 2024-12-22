import { assign, emit } from 'xstate';
import { setupArvoMachine } from '../../../../../src';
import {
  incrementContract,
  incrementOrchestratorContract,
  valueReadContract,
} from '../../../contracts';
import { IncrementMachineContract } from '../types';

const machineId = 'machineV002';
export const machineV002 = setupArvoMachine({
  contracts: {
    self: incrementOrchestratorContract.version('0.0.2'),
    services: {
      valueReader: valueReadContract.version('0.0.1'),
      increment: incrementContract.version('0.0.2'),
    },
  },
  types: {
    context: {} as IncrementMachineContract,
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCGBjAFgSwHZgDUBGABhIDoAzMAFywH0A3VAGwFcwBiMRm859mHIAnMKgjlYbdOjiwA2iQC6iUAAcA9rGw1sG3KpAAPREQAcAJnIkALBYskAbAGYA7M5skiNswBoQAJ6mLuSuJM5EzgCsUa5RNjYAnGaOAL6p-mhYeISkFNR0mEysHJywAbDk6BrI-CVCouLkYMLCGsKKKkggmtq6+oYmCMnkiY6uZs5mUUSJiURR4f5BCDYhno5EjnaRzhZx6ZkYOPjEZOR46KLIYLg03LwXuFdgN3fkuGzIAEYtktKyWAKZSGXo6PQGbpDTZmchmIgTfZeSKeIjLYLOULhUjJSauVwWLaHEBZE65c6Xa63e7lSrVWqU17Uj5fX7CZqtdqdUFacEDKGINyOcjRRJTMgIlzOWzo1brJyEmJjRyWRLpDIgXAaCBwQyknJnEg8voQwaIAC0UUxFhSETmFkW4pSsri5DsYzIUQdyUiao1+tOeSotAYAg4xr5kNAQ0t5BtLlmiQd4TMJGdgWCViTiVcuxIYvMNmJAfJFEZbxoEf6UeMiASNlC8P2jhtniT3llWyzFjGZlcm37G1cxeOBqDLTawirpoFwx75AR+bmjhIrmzzllNn7cc8UU2XtzewsI+ygfOEH0YGn-OjiCTsM2LlXXhsi5snemC7Xjj3qcmREJdVUiAA */
  id: machineId,
  context: ({ input }) => ({
    key: input.subject,
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
          target: 'increment',
        },
        'sys.com.value.read.error': {
          actions: assign({
            error: ({ context, event }) => [...context.error, event.data],
          }),
          target: 'error',
        },
      },
    },
    increment: {
      entry: emit(({ context }) => ({
        type: 'com.increment.number',
        data: {
          init: context.value,
          multiplier: context.modifier,
        },
      })),
      on: {
        'evt.increment.number.success': {
          actions: assign({ value: ({ event }) => event.data.result }),
          target: 'done',
        },
        'sys.com.increment.number.error': {
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
