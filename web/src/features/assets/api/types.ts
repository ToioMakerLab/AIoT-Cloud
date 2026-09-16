// Mirrors backend enums/dtos verbatim — see:
// src/modules/asset/asset.entity.ts
// src/modules/asset/dtos/{asset,create-asset,update-asset,attach-asset-node,update-asset-node,asset-health}.dto.ts
// src/constants/{asset-type,asset-health-status}.ts

export const AssetType = {
  MOTOR: 'MOTOR',
  PUMP: 'PUMP',
  COMPRESSOR: 'COMPRESSOR',
  FAN: 'FAN',
  OTHER: 'OTHER',
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const AssetHealthStatus = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AssetHealthStatus = (typeof AssetHealthStatus)[keyof typeof AssetHealthStatus];

export interface IAsset {
  id: string;
  name: string;
  type: AssetType;
  description?: string | null;
  userId: string;
  factoryId?: string | null;
  installedAt?: string | null;
  expectedLifespanMonths?: number | null;
  healthIndex?: number | null;
  healthStatus: AssetHealthStatus;
  healthAssessedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAsset {
  name: string;
  type?: AssetType;
  description?: string | null;
  installedAt?: string | null;
  expectedLifespanMonths?: number | null;
}

export interface IUpdateAsset {
  name?: string;
  type?: AssetType;
  description?: string | null;
  installedAt?: string | null;
  expectedLifespanMonths?: number | null;
  isActive?: boolean;
}

export interface IAttachAssetNode {
  deviceId: string;
  healthWeight?: number;
}

export interface IUpdateAssetNode {
  healthWeight: number;
}

/** src/modules/asset/dtos/asset-health.dto.ts::AssetHealthFactor */
export interface IAssetHealthFactor {
  key: 'age' | 'connectivity' | 'telemetryHealth';
  label: string;
  score: number;
  weight: number;
  detail: string;
}

/** src/modules/asset/dtos/asset-health.dto.ts::AssetHealthNodeBreakdown */
export interface IAssetHealthNodeBreakdown {
  deviceId: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE';
  healthWeight: number;
  breaches: number;
  totalChecks: number;
}

/** Response for GET /assets/:id/health — recomputed fresh (and persisted) on every call. */
export interface IAssetHealthAssessment {
  assetId: string;
  status: AssetHealthStatus;
  score: number | null;
  installedAt: string;
  expectedLifespanMonths: number;
  ageMonths: number;
  remainingLifespanMonths: number;
  factors: IAssetHealthFactor[];
  nodes: IAssetHealthNodeBreakdown[];
  assessedAt: string;
}

export interface IAssetsQuery {
  page?: number;
  take?: number;
  order?: 'ASC' | 'DESC';
  q?: string;
}

/** src/common/dto/page-meta.dto.ts */
export interface IPageMeta {
  page: number;
  take: number;
  itemCount: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** src/common/dto/page.dto.ts */
export interface IPageDto<T> {
  data: T[];
  meta: IPageMeta;
}

// Mirrors backend `ResponseCore<T>` (src/common/dto/response-core.dto.ts):
// { error: ErrorCode, data: T | null, message: string }. Business failures on
// this API come back as HTTP 200 with a non-zero `error` code, so callers
// must check it.
export interface IResponseCore<T> {
  error: number;
  data: T | null;
  message: string;
}

export const SUCCESS_CODE = 0;
