import { z } from 'zod';
import type { IDashboardWidget, IDevice, WidgetType } from '../api/types';

// Bumped only if the exported shape changes in a way older imports can't read.
const DASHBOARD_CONFIG_VERSION = 1;

export interface IDashboardConfigFile {
  version: number;
  name: string;
  isDefault: boolean;
  widgets: Array<
    Omit<IDashboardWidget, 'id' | 'deviceId'> & {
      // Carries the device's physical identifier + name (not just its DB id) so a config
      // exported from one environment/account can still be re-matched to a device on import
      // even if the device's DB id differs.
      device: { id: string; deviceId: string; name: string };
    }
  >;
}

const widgetSchema = z.object({
  widgetType: z.enum(['VALUE', 'CHART', 'ACTION']),
  field: z.string().optional(),
  title: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  device: z.object({
    id: z.string().optional(),
    deviceId: z.string().optional(),
    name: z.string().optional(),
  }),
});

const configFileSchema = z.object({
  version: z.number(),
  name: z.string(),
  isDefault: z.boolean().optional(),
  widgets: z.array(widgetSchema),
});

export function buildDashboardConfigExport(
  draft: { name: string; isDefault: boolean; widgets: IDashboardWidget[] },
  devices: IDevice[],
): IDashboardConfigFile {
  return {
    version: DASHBOARD_CONFIG_VERSION,
    name: draft.name,
    isDefault: draft.isDefault,
    widgets: draft.widgets.map(({ id: _id, deviceId, ...rest }) => {
      const device = devices.find((d) => d.id === deviceId);
      return {
        ...rest,
        device: { id: deviceId, deviceId: device?.deviceId ?? '', name: device?.name ?? '' },
      };
    }),
  };
}

export interface IParsedDashboardConfig {
  name: string;
  isDefault: boolean;
  widgets: IDashboardWidget[];
  skippedCount: number;
}

/** Throws if `raw` isn't a recognizable dashboard config file. */
export function parseDashboardConfigImport(raw: unknown, devices: IDevice[]): IParsedDashboardConfig {
  const file = configFileSchema.parse(raw);

  let skippedCount = 0;
  const widgets: IDashboardWidget[] = [];
  for (const widget of file.widgets) {
    // Prefer the DB id (exact match within the same account); fall back to the device's
    // physical deviceId for configs imported across accounts/environments.
    const device = devices.find((d) => d.id === widget.device.id) ?? devices.find((d) => d.deviceId === widget.device.deviceId);
    if (!device) {
      skippedCount += 1;
      continue;
    }
    widgets.push({
      id: crypto.randomUUID(),
      deviceId: device.id,
      widgetType: widget.widgetType as WidgetType,
      field: widget.field,
      title: widget.title,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
    });
  }

  return { name: file.name, isDefault: file.isDefault ?? false, widgets, skippedCount };
}
