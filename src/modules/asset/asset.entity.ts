import { Column, Entity, Index } from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { AssetHealthStatus } from '../../constants/asset-health-status.ts';
import { AssetType } from '../../constants/asset-type.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { AssetDto } from './dtos/asset.dto.ts';

/**
 * A physical piece of equipment (e.g. a motor, pump, compressor) monitored by one or more
 * `DeviceEntity` nodes (a current sensor, a temperature/vibration sensor, a relay, ...) via
 * `DeviceEntity.assetId`. Its `healthIndex`/`healthStatus` are an aggregate of those nodes'
 * connectivity and telemetry — see AssetHealthService.
 */
@Entity({ name: 'assets' })
@UseDto(AssetDto)
export class AssetEntity extends AbstractEntity<AssetDto> {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'enum', enum: AssetType, default: AssetType.OTHER })
  type!: AssetType;

  @Column({ nullable: true, type: 'varchar' })
  description!: string | null;

  @Index()
  @Column({ type: 'varchar' })
  userId!: string;

  /** Same "widen read access to the whole factory" role as `DeviceEntity.factoryId` — see `resolveAccessScope`. */
  @Index()
  @Column({ nullable: true, type: 'varchar' })
  factoryId!: string | null;

  /** Commissioning date the health index's age factor counts from; falls back to `createdAt` when unset. */
  @Column({ nullable: true, type: 'timestamp' })
  installedAt!: Date | null;

  /** Months this asset is expected to remain serviceable; falls back to a default when unset — see AssetHealthService. */
  @Column({ nullable: true, type: 'int' })
  expectedLifespanMonths!: number | null;

  /** Last computed health index, 0-100 — null until at least one node is attached and assessed. */
  @Column({ nullable: true, type: 'int' })
  healthIndex!: number | null;

  /** Plain varchar rather than a Postgres enum, same reasoning as `DeviceEntity.lifecycleStage` — validated in code (AssetHealthStatus). */
  @Column({ type: 'varchar', default: AssetHealthStatus.UNKNOWN })
  healthStatus!: AssetHealthStatus;

  @Column({ nullable: true, type: 'timestamp' })
  healthAssessedAt!: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
