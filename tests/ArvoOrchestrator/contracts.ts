import {
  ArvoErrorSchema,
  createArvoContract,
  createArvoOrchestratorContract,
  createSimpleArvoContract,
} from 'arvo-core';
import { z } from 'zod';

export const incrementContract = createArvoContract({
  uri: '#/test/handler/increment',
  type: 'com.increment.number',
  versions: {
    '0.0.1': {
      accepts: z.object({
        init: z.number(),
        increment: z.number(),
      }),
      emits: {
        'evt.increment.number.success': z.object({
          result: z.number(),
        }),
      },
    },
    '0.0.2': {
      accepts: z.object({
        init: z.number(),
        multiplier: z.number(),
      }),
      emits: {
        'evt.increment.number.success': z.object({
          result: z.number(),
        }),
        'evt.multiplier.number.success': z.object({
          result: z.number(),
        }),
      },
    },
  },
});

export const decrementContract = createSimpleArvoContract({
  uri: '#/test/handler/decrement',
  type: 'decrement.number',
  versions: {
    '0.0.1': {
      accepts: z.object({
        init: z.number(),
        decrement: z.number(),
      }),
      emits: z.object({
        result: z.number(),
      }),
    },
    '0.0.2': {
      accepts: z.object({
        init: z.number(),
        divider: z.number(),
      }),
      emits: z.object({
        result: z.number(),
      }),
    },
  },
});

export const valueWriteContract = createSimpleArvoContract({
  uri: '#/test/handler/value/write',
  type: 'value.write',
  versions: {
    '0.0.1': {
      accepts: z.object({
        key: z.string(),
        value: z.number(),
      }),
      emits: z.object({
        success: z.boolean(),
      }),
    },
  },
});

export const valueReadContract = createSimpleArvoContract({
  uri: '#/test/handler/value/read',
  type: 'value.read',
  versions: {
    '0.0.1': {
      accepts: z.object({
        key: z.string(),
      }),
      emits: z.object({
        value: z.number(),
      }),
    },
  },
});

export const incrementOrchestratorContract = createArvoOrchestratorContract({
  uri: '#/test/orchestrator/increment',
  name: 'inc',
  versions: {
    '0.0.1': {
      init: z.object({
        modifier: z.number(),
        trend: z.literal('linear'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
    '0.0.2': {
      init: z.object({
        modifier: z.number(),
        trend: z.literal('exponential'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
  },
});

export const decrementOrchestratorContract = createArvoOrchestratorContract({
  uri: '#/test/orchestrator/decrement',
  name: 'dec',
  versions: {
    '0.0.1': {
      init: z.object({
        modifier: z.number(),
        trend: z.literal('linear'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
    '0.0.2': {
      init: z.object({
        modifier: z.number(),
        trend: z.literal('exponential'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
  },
});

export const numberModifierOrchestrator = createArvoOrchestratorContract({
  uri: '#/test/orchestrator/number/modifier',
  name: 'number.modifier',
  versions: {
    '0.0.1': {
      init: z.object({
        init: z.number(),
        modifier: z.number(),
        operation: z.enum(['increment', 'decrement']),
        trend: z.literal('linear'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
    '0.0.2': {
      init: z.object({
        init: z.number(),
        modifier: z.number(),
        operation: z.enum(['increment', 'decrement']),
        trend: z.literal('exponential'),
      }),
      complete: z.object({
        success: z.boolean(),
        error: ArvoErrorSchema.array(),
        final: z.number(),
      }),
    },
  },
});
