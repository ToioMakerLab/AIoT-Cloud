import { z } from 'zod';

const assetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['MOTOR', 'PUMP', 'COMPRESSOR', 'FAN', 'OTHER']),
  description: z.string().nullish(),
  installedAt: z.string().nullish(),
  expectedLifespanMonths: z.number().nullish(),
  healthIndex: z.number().nullish(),
  healthStatus: z.enum(['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN']),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetListSchema = z.array(assetSchema);
