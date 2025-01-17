import { assign, emit } from 'xstate';
import { setupArvoMachine } from '../../../../../src';
import {
  decrementOrchestratorContract,
  incrementOrchestratorContract,
  numberModifierOrchestrator,
  valueReadContract,
  valueWriteContract,
} from '../../../contracts';
import type { NumberModiferMachineContext } from '../types';

const machineId = 'machineV002';
export const machineV002 = setupArvoMachine({
  contracts: {
    self: numberModifierOrchestrator.version('0.0.2'),
    services: {
      valueWriter: valueWriteContract.version('0.0.1'),
      valueReader: valueReadContract.version('0.0.1'),
      increment: incrementOrchestratorContract.version('0.0.2'),
      decrement: decrementOrchestratorContract.version('0.0.2'),
    },
  },
  types: {
    context: {} as NumberModiferMachineContext & {
      trend: 'exponential';
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCGBjAFgSwHZgDUAGIgRgDo9sAXAfQDdUAbAVzAGIx7rzHWxyAdwBONAbBbp0cWAG0iAXUSgADgHtYNbGtzKQAD0QAmUkXIBOAGwAOAOwBWe0aMBmFwBYjRWwBoQAT0RrCnsSMKNzF1JbWyN3AF94vzQsPEISCio6PjZObl5mNiFRanFJaVg5UiUkEHVNam1dWsMEEzMrO0dnN09vP0CEF3sKIiije0tLW2Dzd0tE5IwcfGIySlwaBkKOWH9YcnQ1ZAL+YrFyMGFhNWF5GtUNLR09VvaLGwcnVw8vXwDENFbOR3PZxtNSNZ3PNvIsQCkVul1jcWKVhOx7np6s9mqBWlNrOQiJFbJZPKQKXMBohQoTQjMou4otZLC5rHCEWk1hQUWiMdUsU9Gi8WogCUSSWSTJT3NSELYrOQXBCZmFLGQOcsuRlyLyrhijA86kKmq8xTYJS5SeSZXKXF4LBEbOZIqZrER7JrUqsdRAwOhhGBkGBcNR2KhhPQ1ORbuhyH64xAdGBMbVscLcQZASQXBYiJYjA5ifaXB65UWiaRJlFlTEul7Edz4-7A8HQ+HI9HY83E8nZAK0yaRXjs2M8wWi5FXGWAQg5hRzCZrFCl-aRg3tesE62Q2G9gcI1GY8JE-7LtdbqnHg1TaKEKYx+Z84XQlPS-Y5VD7B8ujFIh7WQ3H11jwAMg13Dsj27UD4z7RRBRvYcs3vHNxxfYtpw-WdHEJUwSWsEZYncF0gKRTJcDAtsw0PLsTw2Xt8H7I101vEcUMfZ9JxLGdBksex3CJAtQmIzwRjsUim1And233cgaOPOMYKuG47ngwdEMzVoH1zJ8J1fbisMGeYjHIKshK8cxSHMYJ80SJIQFwNQ-XgWpOWA0gEJxM0EAAWksOU-IknUsm2fhPIzbzPDlUwTPVMzSEsSzTBmILkTUVErnC1jkMccxyBmUgjCmEwHCK6w7RGcgwUK9wCLITxbBcVKKG3cDQyypDWmsDwLCtEZrMS5coXLWwKApWJiUpCYiua+jpOoDrNKCHqSX6llrOXWVZ1q3MJj-UblStUbZuU25Fu80gPFzUh3HzWr1UsS7arlWqBMuox3UiSZC28BJ7LcsjYPwc67ye67brJFl8ye8rZxsXNbA9RqiAIoS+Ls+IgA */
  id: machineId,
  context: ({ input }) => ({
    ...input.data,
    currentSubject$$: input.subject,
    key: input.subject,
    errors: [],
    final_value: 0,
  }),
  output: ({ context }) => ({
    success: !context.errors.length,
    error: context.errors,
    final: context.final_value,
  }),
  initial: 'init_value',
  states: {
    init_value: {
      entry: emit(({ context }) => ({
        type: 'com.value.write',
        data: {
          key: context.key,
          value: context.init,
        },
      })),
      on: {
        'evt.value.write.success': [
          {
            guard: ({ event }) => !event.data.success,
            target: 'error',
            actions: assign({
              errors: ({ context }) => [
                ...context.errors,
                {
                  errorName: 'WriteFailure',
                  errorMessage: 'Failed to write the value',
                  errorStack: null,
                },
              ],
            }),
          },
          {
            target: 'router',
          },
        ],
        'sys.com.value.write.error': {
          target: 'error',
          actions: assign({
            errors: ({ context, event }) => [...context.errors, event.data],
          }),
        },
      },
    },
    router: {
      always: [
        {
          guard: ({ context }) => context.operation === 'increment',
          target: 'increment',
        },
        {
          guard: ({ context }) => context.operation === 'decrement',
          target: 'decrement',
        },
        {
          target: 'error',
          actions: assign({
            errors: ({ context }) => [
              ...context.errors,
              {
                errorName: 'OperationRouteFailure',
                errorMessage: 'Failed to route to the required operation',
                errorStack: null,
              },
            ],
          }),
        },
      ],
    },
    decrement: {
      entry: [
        emit(({ context }) => ({
          type: 'arvo.orc.dec',
          data: {
            parentSubject$$: context.currentSubject$$,
            key: context.key,
            modifier: context.modifier,
            trend: context.trend,
          },
        })),
        emit(({ context }) => ({
          type: 'arvo.orc.dec',
          data: {
            parentSubject$$: 'test',
            key: context.key,
            modifier: context.modifier,
            trend: context.trend,
          },
        })),
      ],
      on: {
        'arvo.orc.dec.done': [
          {
            guard: ({ event }) => !event.data.success,
            target: 'error',
            actions: assign({
              errors: ({ context, event }) => [...context.errors, ...event.data.error],
            }),
          },
          {
            target: 'done',
            actions: assign({ final_value: ({ event }) => event.data.final }),
          },
        ],
        'sys.arvo.orc.dec.error': {
          target: 'error',
          actions: assign({
            errors: ({ context, event }) => [...context.errors, event.data],
          }),
        },
      },
    },
    increment: {
      entry: [
        emit(({ context }) => ({
          type: 'arvo.orc.inc',
          data: {
            parentSubject$$: context.currentSubject$$,
            key: context.key,
            modifier: context.modifier,
            trend: context.trend,
          },
        })),
        emit(({ context }) => ({
          type: 'arvo.orc.inc',
          data: {
            parentSubject$$: null,
            key: context.key,
            modifier: context.modifier,
            trend: context.trend,
          },
        })),
      ],
      on: {
        'arvo.orc.inc.done': [
          {
            guard: ({ event }) => !event.data.success,
            target: 'error',
            actions: assign({
              errors: ({ context, event }) => [...context.errors, ...event.data.error],
            }),
          },
          {
            target: 'done',
            actions: assign({ final_value: ({ event }) => event.data.final }),
          },
        ],
        'sys.arvo.orc.inc.error': {
          target: 'error',
          actions: assign({
            errors: ({ context, event }) => [...context.errors, event.data],
          }),
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
