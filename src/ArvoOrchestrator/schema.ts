import { z } from "zod";

/**
* Zod schema for validating XState persistent snapshots.
* This ensures that the state saved and restored is in the correct format.
*/
export const xstatePersistanceSchema = z.object({
 status: z.enum(['active', 'done', 'error', 'stopped']),
 value: z.union([z.string(), z.record(z.string(), z.any())]),
 context: z.record(z.string(), z.any()),
 historyValue: z.any().optional(),
 error: z.any().optional(),
 output: z.any().optional(),
 children: z.any().optional(),
});