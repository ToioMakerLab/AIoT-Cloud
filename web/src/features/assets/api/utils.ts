import type { Asset } from '../data/schema';
import type { IAsset } from './types';

export function mapIAssetToAsset(a: IAsset): Asset {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description,
    installedAt: a.installedAt,
    expectedLifespanMonths: a.expectedLifespanMonths,
    healthIndex: a.healthIndex,
    healthStatus: a.healthStatus,
    isActive: a.isActive,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt),
  };
}
