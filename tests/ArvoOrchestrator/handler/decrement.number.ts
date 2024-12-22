import {
  createArvoEventHandler,
  EventHandlerFactory,
} from 'arvo-event-handler';
import { decrementContract } from '../contracts';

export const decrementNumberHandler: EventHandlerFactory = () =>
  createArvoEventHandler({
    contract: decrementContract,
    executionunits: 0.1,
    handler: {
      '0.0.1': async ({ event }) => {
        const finalValue = event.data.init + event.data.decrement;
        return {
          type: 'evt.decrement.number.success',
          data: {
            result: finalValue,
          },
        };
      },
      '0.0.2': async ({ event }) => {
        const finalValue = event.data.init / event.data.divider;
        return {
          type: 'evt.decrement.number.success',
          data: {
            result: finalValue,
          },
        };
      },
    },
  });
