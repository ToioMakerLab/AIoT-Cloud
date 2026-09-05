import { z } from 'zod';

// Values match backend `DeviceTemplateType` enum exactly
// (src/constants/device-template-type.ts).
export const deviceTemplateTypeSchema = z.union([
  z.literal('SENSOR_NODE'),
  z.literal('RELAY_NODE'),
  z.literal('RELAY_CURRENT_NODE'),
  z.literal('GATEWAY'),
  z.literal('OTHER'),
]);
export type DeviceTemplateType = z.infer<typeof deviceTemplateTypeSchema>;

export const telemetryFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  warningMin: z.number().optional(),
  warningMax: z.number().optional(),
});
export type TelemetryField = z.infer<typeof telemetryFieldSchema>;

// Values match backend `DeviceActionType` enum exactly
// (src/constants/device-action-type.ts).
export const deviceActionTypeSchema = z.union([z.literal('TOGGLE'), z.literal('BUTTON')]);
export type DeviceActionType = z.infer<typeof deviceActionTypeSchema>;

export const actionFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: deviceActionTypeSchema,
  onValue: z.string().nullish(),
  offValue: z.string().nullish(),
});
export type ActionField = z.infer<typeof actionFieldSchema>;

const deviceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: deviceTemplateTypeSchema,
  description: z.string().nullish(),
  manufacturer: z.string().nullish(),
  telemetrySchema: z.array(telemetryFieldSchema).nullish(),
  actionSchema: z.array(actionFieldSchema).nullish(),
  icon: z.string().nullish(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DeviceTemplate = z.infer<typeof deviceTemplateSchema>;

export const deviceTemplateListSchema = z.array(deviceTemplateSchema);
