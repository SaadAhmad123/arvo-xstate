import type { EventHandlerFactory } from 'arvo-event-handler';
import { createArvoResumable, type IMachineMemory } from '../../../../src';
import {
  decrementContract,
  decrementOrchestratorContract,
  valueReadContract,
  valueWriteContract,
} from '../../../ArvoOrchestrator/contracts';
import type { DecrementResumableState } from './types';

export const decrementResumable: EventHandlerFactory<{
  memory: IMachineMemory<any>;
}> = ({ memory }) =>
  createArvoResumable({
    contracts: {
      self: decrementOrchestratorContract,
      services: {
        valueReader: valueReadContract.version('0.0.1'),
        valueWriter: valueWriteContract.version('0.0.1'),
        decrement: decrementContract.version('0.0.1'),
      },
    },
    types: {
      context: {} as DecrementResumableState,
    },
    memory,
    handler: {
      '0.0.1': async ({ init, service, context }) => {
        if (service?.type === 'sys.com.decrement.number.error' || service?.type === 'sys.com.value.read.error') {
          return {
            complete: {
              data: {
                success: false,
                error: [service.data],
                final: 0,
              },
            },
          };
        }

        if (init) {
          return {
            context: {
              key: init.data.key,
              value: 0,
              modifier: init.data.modifier,
              trend: init.data.trend,
              error: [],
            },
            services: [
              {
                type: 'com.value.read' as const,
                data: {
                  key: init.data.key,
                },
              },
            ],
          };
        }

        if (!context) {
          throw new Error('Faulty initialisation detected');
        }

        if (service?.type === 'evt.value.read.success') {
          return {
            context: {
              ...context,
              value: service.data.value,
            },
            services: [
              {
                type: 'com.decrement.number' as const,
                data: {
                  init: service.data.value,
                  decrement: context.modifier,
                },
              },
            ],
          };
        }

        if (service?.type === 'evt.decrement.number.success') {
          return {
            context: {
              ...context,
              value: service.data.result,
            },
            complete: {
              data: {
                success: true,
                error: [],
                final: service.data.result,
              },
            },
            services: [
              {
                type: 'com.value.write' as const,
                data: {
                  key: context.key,
                  value: service.data.result,
                },
              },
            ],
          };
        }
      },
      '0.0.2': async () => {
        throw new Error('Version 0.0.2 is not implemented for decrement resumable');
      },
    },
  });
