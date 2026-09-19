import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { DeviceLifecycleStage } from '../../../constants/device-lifecycle-stage.ts';
import { DeviceOtaStatus } from '../../../constants/device-ota-status.ts';
import { DevicePushChannel } from '../../../constants/device-push-channel.ts';
import { DeviceStatus } from '../../../constants/device-status.ts';
import {
  BooleanField,
  ClassFieldOptional,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators.ts';
import { DeviceTemplateDto } from '../../device-template/dtos/device-template.dto.ts';
import type { DeviceEntity } from '../device.entity.ts';
import type {
  DeviceAlertRule,
  DeviceFailsafeConfig,
  DeviceNetworkConfig,
  DeviceOfflineAlertConfig,
  DeviceWarningOverrides,
} from '../interfaces/device-network-config.interface.ts';

export class DeviceDto extends AbstractDto {
  @StringField()
  deviceId!: string;

  @StringField()
  name!: string;

  @StringField()
  templateId!: string;

  @ClassFieldOptional(() => DeviceTemplateDto)
  template?: DeviceTemplateDto;

  @StringField()
  userId!: string;

  @StringFieldOptional({ nullable: true })
  factoryId?: string | null;

  @StringFieldOptional({ nullable: true })
  assetId?: string | null;

  @NumberFieldOptional()
  healthWeight?: number;

  @DateFieldOptional({ nullable: true })
  lastSeenAt?: Date | null;

  @EnumField(() => DeviceStatus)
  status!: DeviceStatus;

  @EnumField(() => DevicePushChannel)
  pushChannel!: DevicePushChannel;

  /** Non-secret network config — device secret hash never leaves the entity. */
  config?: DeviceNetworkConfig | null;

  @BooleanField()
  isActive!: boolean;

  warningOverrides?: DeviceWarningOverrides | null;

  channelStates?: Record<string, string> | null;

  offlineAlert?: DeviceOfflineAlertConfig | null;

  alertRules?: DeviceAlertRule[] | null;

  failsafe?: DeviceFailsafeConfig | null;

  @DateFieldOptional({ nullable: true })
  installedAt?: Date | null;

  @NumberFieldOptional({ nullable: true, int: true })
  expectedLifespanMonths?: number | null;

  @EnumFieldOptional(() => DeviceLifecycleStage)
  lifecycleStage?: DeviceLifecycleStage;

  @NumberFieldOptional({ nullable: true, int: true })
  lifecycleScore?: number | null;

  @DateFieldOptional({ nullable: true })
  lifecycleAssessedAt?: Date | null;

  @StringFieldOptional({ nullable: true })
  firmwareVersion?: string | null;

  @EnumFieldOptional(() => DeviceOtaStatus)
  otaStatus?: DeviceOtaStatus;

  @StringFieldOptional({ nullable: true })
  otaFirmwareId?: string | null;

  @StringFieldOptional({ nullable: true })
  otaTargetVersion?: string | null;

  @NumberFieldOptional({ nullable: true, int: true })
  otaProgress?: number | null;

  @StringFieldOptional({ nullable: true })
  otaError?: string | null;

  @DateFieldOptional({ nullable: true })
  otaRequestedAt?: Date | null;

  @DateFieldOptional({ nullable: true })
  otaUpdatedAt?: Date | null;

  constructor(entity: DeviceEntity) {
    super(entity);
    this.deviceId = entity.deviceId;
    this.name = entity.name;
    this.templateId = entity.templateId;
    this.template = entity.template?.toDto();
    this.userId = entity.userId;
    this.factoryId = entity.factoryId;
    this.assetId = entity.assetId;
    this.healthWeight = entity.healthWeight;
    this.lastSeenAt = entity.lastSeenAt;
    this.status = entity.status;
    this.pushChannel = entity.pushChannel;
    // Both the Kafka and MQTT broker passwords are stored and returned as plaintext (see
    // DeviceService.updateDeviceConfig) - Kafka's used to be base64-encoded at rest, but that
    // was dropped since it only obscured the value from a casual glance rather than actually
    // protecting it.
    this.config = entity.config && {
      ...entity.config,
      mqtt: entity.config.mqtt && { ...entity.config.mqtt, password: entity.config.mqtt.password },
      kafka: entity.config.kafka && { ...entity.config.kafka, password: entity.config.kafka.password },
    };
    this.isActive = entity.isActive;
    this.warningOverrides = entity.warningOverrides;
    this.channelStates = entity.channelStates;
    this.offlineAlert = entity.offlineAlert;
    this.alertRules = entity.alertRules;
    this.failsafe = entity.failsafe;
    this.installedAt = entity.installedAt;
    this.expectedLifespanMonths = entity.expectedLifespanMonths;
    this.lifecycleStage = entity.lifecycleStage;
    this.lifecycleScore = entity.lifecycleScore;
    this.lifecycleAssessedAt = entity.lifecycleAssessedAt;
    this.firmwareVersion = entity.firmwareVersion;
    this.otaStatus = entity.otaStatus as DeviceOtaStatus;
    this.otaFirmwareId = entity.otaFirmwareId;
    this.otaTargetVersion = entity.otaTargetVersion;
    this.otaProgress = entity.otaProgress;
    this.otaError = entity.otaError;
    this.otaRequestedAt = entity.otaRequestedAt;
    this.otaUpdatedAt = entity.otaUpdatedAt;
  }
}
