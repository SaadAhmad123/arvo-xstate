import type { EventHandlerFactory } from 'arvo-event-handler';
import { createArvoResumable, type IMachineMemory } from '../../../../src';
import { incrementContract, valueReadContract, valueWriteContract } from '../../../ArvoOrchestrator/contracts';
import type { IncrementResumableContext } from './types';
import { incrementResumableContact } from '../../contracts/increment.resumable';

export const incrementResumable: EventHandlerFactory<{ memory: IMachineMemory<any> }> = ({ memory }) =>
  createArvoResumable({
    contracts: {
      self: incrementResumableContact,
      services: {
        valueReader: valueReadContract.version('0.0.1'),
        valueWriter: valueWriteContract.version('0.0.1'),
        increment: incrementContract.version('0.0.1'),
      },
    },
    types: {
      context: {} as IncrementResumableContext,
    },
    memory,
    handler: {
      '0.0.1': async ({ init, service, context, collectedEvents }) => {
        if (
          service?.type === 'sys.com.increment.number.error' ||
          service?.type === 'sys.com.value.read.error' ||
          service?.type === 'sys.com.value.write.error'
        ) {
          return {
            complete: {
              data: {
                success: false,
                error: [service.data],
                final: [],
              },
            },
          };
        }

        if (init) {
          return {
            context: {
              modifications: init.data.modifications.map((item) => ({
                key: item.key,
                value: null,
                modifier: item.value,
              })),
              error: [],
            },
            services: init.data.modifications.map((item) => ({
              type: 'com.value.read' as const,
              data: {
                key: item.key,
              },
            })),
          };
        }

        if (!context) {
          throw new Error('Bad initialisation detected');
        }

        if (collectedEvents['evt.value.read.success']?.length === context.modifications.length) {
          const readKeyToValue: Record<string, number> = Object.fromEntries(
            collectedEvents['evt.value.read.success'].map((item) => [item.data.key, item.data.value]),
          );

          return {
            context: {
              ...context,
              modifications: context.modifications.map((item) => ({
                ...item,
                value: readKeyToValue[item.key],
              })),
            },
            services: context.modifications.map((item) => ({
              type: 'com.increment.number' as const,
              data: {
                init: readKeyToValue[item.key],
                increment: item.modifier,
              },
            })),
          };
        }

        if (collectedEvents['evt.increment.number.success']?.length === context.modifications.length) {
          return {
            context: {
              ...context,
              modifications: context.modifications.map((item, index) => ({
                ...item,
                value: collectedEvents['evt.increment.number.success']?.[index]?.data?.result ?? item.value ?? null,
              })),
            },
            complete: {
              data: {
                success: true,
                error: [],
                final: context.modifications.map((item, index) => ({
                  key: item.key,
                  value: collectedEvents['evt.increment.number.success']?.[index]?.data?.result ?? item.value ?? 0,
                })),
              },
            },
            services: context.modifications.map((item, index) => ({
              type: 'com.value.write' as const,
              data: {
                key: item.key,
                value: collectedEvents['evt.increment.number.success']?.[index]?.data?.result ?? item.value ?? 0,
              },
            })),
          };
        }
      },
    },
  });
