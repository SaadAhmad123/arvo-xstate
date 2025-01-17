import { type EventHandlerFactory, createArvoEventHandler } from 'arvo-event-handler';
import { valueWriteContract } from '../contracts';
import type { ValueStoreConfig } from './types';

export const valueWriteHandler: EventHandlerFactory<ValueStoreConfig> = ({ valueStore }) =>
  createArvoEventHandler({
    contract: valueWriteContract,
    executionunits: 0,
    handler: {
      '0.0.1': async ({ event }) => {
        let success = true;
        if (event.data.value === -100) {
          success = false;
        }
        if (event.data.value === -200) {
          throw new Error(`Invalid value is ${event.data.value}.`);
        }
        valueStore[event.data.key] = event.data.value;
        return {
          type: 'evt.value.write.success',
          data: {
            success: success,
          },
        };
      },
    },
  });
