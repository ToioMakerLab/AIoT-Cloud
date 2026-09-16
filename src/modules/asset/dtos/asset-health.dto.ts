import { AssetHealthStatus } from '../../../constants/asset-health-status.ts';
import { DeviceStatus } from '../../../constants/device-status.ts';

/** One weighted component behind an assessment's overall `score` — see AssetHealthService.assessAsset. */
export interface AssetHealthFactor {
  key: 'age' | 'connectivity' | 'telemetryHealth';
  label: string;
  /** 0-100; higher is healthier. */
  score: number;
  /** This factor's share of the overall score, 0-1; all factors sum to 1. */
  weight: number;
  /** Human-readable explanation of how `score` was reached. */
  detail: string;
}

/** Per-node contribution behind the `connectivity`/`telemetryHealth` factors, for UI drill-down. */
export interface AssetHealthNodeBreakdown {
  deviceId: string;
  name: string;
  status: DeviceStatus;
  /** This node's configured importance (`DeviceEntity.healthWeight`) to the asset's composite score. */
  healthWeight: number;
  breaches: number;
  totalChecks: number;
}

/** Response for GET .../health — recomputed fresh on every call and persisted onto the asset. */
export class AssetHealthAssessmentDto {
  assetId!: string;
  status!: AssetHealthStatus;
  /** 0-100 weighted average of `factors`; `null` when no device nodes are attached yet. */
  score!: number | null;
  installedAt!: Date;
  expectedLifespanMonths!: number;
  ageMonths!: number;
  /** `expectedLifespanMonths - ageMonths`; can go negative once the asset outlives its expected lifespan. */
  remainingLifespanMonths!: number;
  factors!: AssetHealthFactor[];
  nodes!: AssetHealthNodeBreakdown[];
  assessedAt!: Date;
}
