import { ArvoErrorSchema, createArvoOrchestratorContract } from 'arvo-core';
import { z } from 'zod';

export const incrementResumableContact = createArvoOrchestratorContract({
  uri: '#/resumables/inc',
  name: 'inc',
  versions: {
    '0.0.1': {
      init: z.object({
        modifications: z
          .object({
            key: z.string(),
            value: z.number(),
          })
          .array(),
      }),
      complete: z.object({
        success: z.boolean(),
        final: z
          .object({
            key: z.string(),
            value: z.number(),
          })
          .array(),
        error: ArvoErrorSchema.array(),
      }),
    },
  },
});
