import {
  createArvoEventHandler,
  EventHandlerFactory,
} from 'arvo-event-handler';
import { incrementContract } from '../contracts';

export const incrementNumberHandler: EventHandlerFactory = () =>
  createArvoEventHandler({
    contract: incrementContract,
    executionunits: 0.1,
    handler: {
      '0.0.1': async ({ event }) => {
        const finalValue = event.data.init + event.data.increment;
        return {
          type: 'evt.increment.number.success',
          data: {
            result: finalValue,
          },
        };
      },
      '0.0.2': async ({ event }) => {
        const finalValue = event.data.init * event.data.multiplier;
        return [
          {
            type: 'evt.increment.number.success',
            data: {
              result: finalValue,
            },
          },
          {
            type: 'evt.multiplier.number.success',
            data: {
              result: finalValue,
            },
          },
        ];
      },
    },
  });
