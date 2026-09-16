import { IconDeviceUnknown, IconDroplet, IconEngine, IconPropeller, IconWind } from '@tabler/icons-react';
import type { AssetType } from '../api/types';

// Icon-only lookup — labels are translated separately via `getAssetTypes`/`getAssetTypeLabel` below
// (both take a `t`), so this stays free of i18n. Mirrors `DEVICE_TEMPLATE_TYPE_ICONS`
// (device-templates/data/data.ts).
const ASSET_TYPE_ICONS: Record<AssetType, typeof IconEngine> = {
  MOTOR: IconEngine,
  PUMP: IconDroplet,
  COMPRESSOR: IconWind,
  FAN: IconPropeller,
  OTHER: IconDeviceUnknown,
};

export function getAssetTypes(t: (key: string, options?: Record<string, unknown>) => string) {
  return [
    { label: t('types.motor'), value: 'MOTOR' as const, icon: ASSET_TYPE_ICONS.MOTOR },
    { label: t('types.pump'), value: 'PUMP' as const, icon: ASSET_TYPE_ICONS.PUMP },
    { label: t('types.compressor'), value: 'COMPRESSOR' as const, icon: ASSET_TYPE_ICONS.COMPRESSOR },
    { label: t('types.fan'), value: 'FAN' as const, icon: ASSET_TYPE_ICONS.FAN },
    { label: t('types.other'), value: 'OTHER' as const, icon: ASSET_TYPE_ICONS.OTHER },
  ];
}

export function getAssetTypeLabel(t: (key: string, options?: Record<string, unknown>) => string, type: AssetType): string {
  return getAssetTypes(t).find((entry) => entry.value === type)?.label ?? type;
}

/** Tailwind classes for the health-status badge — mirrors `stageColors` (devices/components/device-lifecycle-panel.tsx). */
export const assetHealthStatusColors: Record<string, string> = {
  HEALTHY: 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200',
  WARNING: 'bg-amber-100/30 text-amber-900 dark:text-amber-200 border-amber-200',
  CRITICAL: 'bg-red-100/30 text-red-900 dark:text-red-200 border-red-200',
  UNKNOWN: 'bg-neutral-300/40 text-neutral-600 border-neutral-300',
};

export function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-teal-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}
