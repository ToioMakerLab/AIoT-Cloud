import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { DeviceLifecycleStage } from '../../constants/device-lifecycle-stage.ts';
import { DevicePushChannel } from '../../constants/device-push-channel.ts';
import { DeviceStatus } from '../../constants/device-status.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { AssetEntity } from '../asset/asset.entity.ts';
import { DeviceTemplateEntity } from '../device-template/device-template.entity.ts';
import { UserEntity } from '../user/user.entity.ts';
import { DeviceDto } from './dtos/device.dto.ts';
import type {
  DeviceAlertRule,
  DeviceFailsafeConfig,
  DeviceNetworkConfig,
  DeviceOfflineAlertConfig,
  DeviceWarningOverrides,
} from './interfaces/device-network-config.interface.ts';

@Entity({ name: 'devices' })
@UseDto(DeviceDto)
export class DeviceEntity extends AbstractEntity<DeviceDto> {
  /** Physical/QR identifier printed on the device — distinct from `id`, and what MQTT topics + websocket rooms key on. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  deviceId!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  templateId!: string;

  @ManyToOne(() => DeviceTemplateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template?: DeviceTemplateEntity;

  @Index()
  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** The factory this device belongs to (copied from the registering user's `factoryId`) — lets
   * every account in the same factory read this device, not just its literal owner. */
  @Index()
  @Column({ nullable: true, type: 'varchar' })
  factoryId!: string | null;

  /** The physical equipment (motor, pump, ...) this node monitors — see AssetEntity/AssetHealthService. */
  @Index()
  @Column({ nullable: true, type: 'varchar' })
  assetId!: string | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asset_id' })
  asset?: AssetEntity;

  /** This node's configured importance to its asset's composite health index (see AssetHealthService); default 1. */
  @Column({ type: 'real', default: 1 })
  healthWeight!: number;

  @Column({ nullable: true, type: 'timestamp' })
  lastSeenAt!: Date | null;

  /** Persisted online/offline state; set on telemetry/status-topic traffic and swept to OFFLINE by DeviceStatusScheduler. */
  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.OFFLINE })
  status!: DeviceStatus;

  @Column({ nullable: true, type: 'jsonb' })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: DevicePushChannel, default: DevicePushChannel.MQTT })
  pushChannel!: DevicePushChannel;

  @Column({ nullable: true, type: 'jsonb' })
  config!: DeviceNetworkConfig | null;

  @Column({ type: 'int', default: 1 })
  configVersion!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Per-field overrides of the template's default warning band; keyed by telemetry field key. */
  @Column({ nullable: true, type: 'jsonb' })
  warningOverrides!: DeviceWarningOverrides | null;

  /** Latest applied per-channel actuator state (e.g. `{ relay1: "OFF" }`), merged in from `devices.events` messages. */
  @Column({ nullable: true, type: 'json' })
  channelStates!: Record<string, string> | null;

  /** Notify-on-offline rule — mainly for GATEWAY devices, which have no telemetrySchema of their own to gate warnings on. */
  @Column({ nullable: true, type: 'jsonb' })
  offlineAlert!: DeviceOfflineAlertConfig | null;

  /** Local automation rules a gateway evaluates and acts on itself — shipped via boot-config and cached on-device. */
  @Column({ nullable: true, type: 'jsonb' })
  alertRules!: DeviceAlertRule[] | null;

  /** Safe state a gateway falls back to on its own when it loses the cloud. */
  @Column({ nullable: true, type: 'jsonb' })
  failsafe!: DeviceFailsafeConfig | null;

  /** Commissioning date the lifecycle score's age factor counts from; falls back to `createdAt` when unset. */
  @Column({ nullable: true, type: 'timestamp' })
  installedAt!: Date | null;

  /** Months this device is expected to remain serviceable; falls back to DEFAULT_EXPECTED_LIFESPAN_MONTHS when unset. */
  @Column({ nullable: true, type: 'int' })
  expectedLifespanMonths!: number | null;

  /**
   * Last computed lifecycle stage; kept fresh by DeviceLifecycleScheduler and recomputed on-demand
   * via GET .../lifecycle. Plain varchar rather than a Postgres enum type on purpose — stage values
   * are validated in code (DeviceLifecycleStage), not the DB, so adding/renaming one is a one-line
   * TS change instead of an `ALTER TYPE` migration.
   */
  @Column({ type: 'varchar', default: DeviceLifecycleStage.NEW })
  lifecycleStage!: DeviceLifecycleStage;

  /** Last computed lifecycle health score, 0-100 — see DeviceLifecycleService.assessDevice. */
  @Column({ nullable: true, type: 'int' })
  lifecycleScore!: number | null;

  @Column({ nullable: true, type: 'timestamp' })
  lifecycleAssessedAt!: Date | null;

  /** Set once a user/admin manually decommissions the device; DeviceLifecycleService then stops recomputing its stage. */
  @Column({ nullable: true, type: 'timestamp' })
  decommissionedAt!: Date | null;

  /** Last firmware version the device confirmed it's actually running — set on a `SUCCESS` OTA report, not just requested. */
  @Column({ nullable: true, type: 'varchar' })
  firmwareVersion!: string | null;

  /** Current OTA attempt state; plain varchar for the same reason as `lifecycleStage` — see DeviceOtaStatus. */
  @Column({ type: 'varchar', default: 'IDLE' })
  otaStatus!: string;

  /** The firmware currently (or most recently) being pushed to this device — see DeviceOtaService.triggerUpdate. */
  @Column({ nullable: true, type: 'varchar' })
  otaFirmwareId!: string | null;

  /** The version string of `otaFirmwareId` at trigger time, cached here so status/history reads don't need a join back to `firmwares`. */
  @Column({ nullable: true, type: 'varchar' })
  otaTargetVersion!: string | null;

  /** 0-100, as last reported by the device; `null` before any progress report comes in for the current attempt. */
  @Column({ nullable: true, type: 'int' })
  otaProgress!: number | null;

  /** Set on a `FAILED` OTA report; cleared on the next successful attempt. */
  @Column({ nullable: true, type: 'varchar' })
  otaError!: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  otaRequestedAt!: Date | null;

  /** Last time `otaStatus` changed, whether from a device report or a fresh trigger. */
  @Column({ nullable: true, type: 'timestamp' })
  otaUpdatedAt!: Date | null;
}
