// Mirrors backend enums/dtos verbatim — see:
// src/modules/device/dtos/device.dto.ts
// src/modules/device/dtos/register-device.dto.ts
// src/constants/device-status.ts
// src/constants/device-template-type.ts

/** Minimal mirror of settings/notifications' NotificationChannel — this feature keeps its own copy per the existing "minimal shape" convention below. */
export type NotificationChannel = 'ZALO' | 'WEB_PUSH';

/** Options for picking which channel(s) a warning gate should notify — mirrors NOTIFICATION_CHANNELS in settings/notifications/api/types.ts. */
export const NOTIFICATION_CHANNEL_OPTIONS: { value: NotificationChannel; label: string }[] = [
  { value: 'ZALO', label: 'Zalo' },
  { value: 'WEB_PUSH', label: 'Web Push' },
];

export const DeviceStatus = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

/** src/constants/device-lifecycle-stage.ts */
export const DeviceLifecycleStage = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  AGING: 'AGING',
  MAINTENANCE_DUE: 'MAINTENANCE_DUE',
  END_OF_LIFE: 'END_OF_LIFE',
  DECOMMISSIONED: 'DECOMMISSIONED',
} as const;
export type DeviceLifecycleStage = (typeof DeviceLifecycleStage)[keyof typeof DeviceLifecycleStage];

export const DeviceTemplateType = {
  SENSOR_NODE: 'SENSOR_NODE',
  RELAY_NODE: 'RELAY_NODE',
  RELAY_CURRENT_NODE: 'RELAY_CURRENT_NODE',
  GATEWAY: 'GATEWAY',
  OTHER: 'OTHER',
} as const;
export type DeviceTemplateType = (typeof DeviceTemplateType)[keyof typeof DeviceTemplateType];

export const DevicePushChannel = {
  MQTT: 'MQTT',
  HTTP: 'HTTP',
  KAFKA: 'KAFKA',
} as const;
export type DevicePushChannel = (typeof DevicePushChannel)[keyof typeof DevicePushChannel];

/** One downlink command topic for a single channel of a multi-channel device (e.g. one relay). */
export interface IMqttChannelTopic {
  /** 1-based channel number, matching the order of the template's `actionSchema`. */
  index: number;
  /** The action key from the device template's `actionSchema` (e.g. "relay1"). */
  key: string;
  label: string;
  topic: string;
}

export interface IMqttTopics {
  telemetry: string;
  command?: string | null;
  status?: string | null;
  /** Uplink ack topic for a downlink command's result (see backend `defaultEventTopic`). */
  event?: string | null;
  /** Auto-derived per-channel command topics; present only for multi-channel templates (e.g. RELAY_NODE). */
  channels?: IMqttChannelTopic[] | null;
}

export interface IMqttConfig {
  broker: string;
  port: number;
  username?: string | null;
  password?: string | null;
  topics: IMqttTopics;
}

export interface IHttpPushConfig {
  url: string;
  headers?: Record<string, string> | null;
}

export interface IKafkaConfig {
  brokers: string;
  topics: string[];
  /** Topic the cloud publishes to for sending events/commands down to this device — only set for gateways. */
  commandTopic?: string | null;
  clientId?: string | null;
  username?: string | null;
  password?: string | null;
}

/** Per-field warning threshold override for a device's telemetry gates. */
export interface IDeviceWarningThreshold {
  min?: number;
  max?: number;
  enabled?: boolean;
  /** Unset/empty means "all of the user's enabled channels" — see notification-settings fallback semantics. */
  channels?: NotificationChannel[];
}

/**
 * Notify-on-offline alert rule — mainly for GATEWAY devices, which have no `telemetrySchema` of
 * their own for `IDeviceWarningThreshold` above to gate on.
 */
export interface IDeviceOfflineAlertConfig {
  enabled: boolean;
  /** Unset/empty means "all of the user's enabled channels", same fallback as warning gates. */
  channels?: NotificationChannel[] | null;
}

/**
 * A local automation rule a gateway caches and evaluates itself, without a cloud round-trip —
 * a compact "<field><operator><threshold>:<actionKey>=<actionValue>" string, e.g.
 * "amps.value>10:relay_2=OFF" -> once amps.value > 10, set relay_2 to OFF.
 */
export type IDeviceAlertRule = string;

/** Safe state a gateway falls back to on its own when it loses the cloud (broker/API unreachable). */
export interface IDeviceFailsafeConfig {
  enabled: boolean;
  /** Same "<actionKey>=<actionValue>" shorthand as an alert rule's action half, unconditionally applied. */
  rules?: string[] | null;
}

export interface IDeviceNetworkConfig {
  apiEndpoint?: string | null;
  mqtt?: IMqttConfig | null;
  http?: IHttpPushConfig | null;
  kafka?: IKafkaConfig | null;
}

export interface IUpdateDeviceConfig {
  apiEndpoint?: string | null;
  pushChannel?: DevicePushChannel;
  mqtt?: IMqttConfig | null;
  http?: IHttpPushConfig | null;
  kafka?: IKafkaConfig | null;
  isActive?: boolean;
  warningOverrides?: Record<string, IDeviceWarningThreshold> | null;
  offlineAlert?: IDeviceOfflineAlertConfig | null;
  alertRules?: IDeviceAlertRule[] | null;
  failsafe?: IDeviceFailsafeConfig | null;
}

export const DeviceActionType = {
  TOGGLE: 'TOGGLE',
  BUTTON: 'BUTTON',
} as const;
export type DeviceActionType = (typeof DeviceActionType)[keyof typeof DeviceActionType];

export interface IDeviceActionFieldDefinition {
  key: string;
  label: string;
  type: DeviceActionType;
  onValue?: string | null;
  offValue?: string | null;
}

/** Minimal mirror of the telemetry field schema — device-templates feature owns the full DTO. */
export interface ITelemetryFieldDefinition {
  key: string;
  label: string;
  unit?: string;
  warningMin?: number;
  warningMax?: number;
}

/** Minimal shape of the templates this feature consumes (device-templates feature owns the full DTO). */
export interface IDeviceTemplateSummary {
  id: string;
  name: string;
  type: DeviceTemplateType;
  description?: string | null;
  manufacturer?: string | null;
  actionSchema?: IDeviceActionFieldDefinition[] | null;
  telemetrySchema?: ITelemetryFieldDefinition[] | null;
  icon?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IDevice {
  id: string;
  deviceId: string;
  name: string;
  templateId: string;
  template?: IDeviceTemplateSummary;
  userId: string;
  /** The physical equipment (motor, pump, ...) this node monitors — see `assets` feature. */
  assetId?: string | null;
  /** This node's configured importance to its asset's composite health index; defaults to 1. */
  healthWeight?: number;
  lastSeenAt?: string | null;
  status: DeviceStatus;
  pushChannel: DevicePushChannel;
  config?: IDeviceNetworkConfig | null;
  isActive: boolean;
  /** Sibling of `config` on the backend response (DeviceDto), not nested inside it. */
  warningOverrides?: Record<string, IDeviceWarningThreshold> | null;
  offlineAlert?: IDeviceOfflineAlertConfig | null;
  alertRules?: IDeviceAlertRule[] | null;
  failsafe?: IDeviceFailsafeConfig | null;
  installedAt?: string | null;
  expectedLifespanMonths?: number | null;
  lifecycleStage?: DeviceLifecycleStage;
  lifecycleScore?: number | null;
  lifecycleAssessedAt?: string | null;
  firmwareVersion?: string | null;
  otaStatus?: DeviceOtaStatus;
  otaFirmwareId?: string | null;
  otaTargetVersion?: string | null;
  otaProgress?: number | null;
  otaError?: string | null;
  otaRequestedAt?: string | null;
  otaUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IRegisterDeviceResult {
  device: IDevice;
}

/** One weighted component behind an assessment's overall `score` — src/modules/device/dtos/device-lifecycle.dto.ts */
export interface IDeviceLifecycleFactor {
  key: 'age' | 'connectivity' | 'telemetryHealth';
  label: string;
  /** 0-100; higher is healthier. */
  score: number;
  /** This factor's share of the overall score, 0-1. */
  weight: number;
  detail: string;
}

/** Response for GET /devices/:id/lifecycle — recomputed fresh (and persisted) on every call. */
export interface IDeviceLifecycleAssessment {
  deviceId: string;
  stage: DeviceLifecycleStage;
  score: number;
  installedAt: string;
  expectedLifespanMonths: number;
  ageMonths: number;
  remainingLifespanMonths: number;
  factors: IDeviceLifecycleFactor[];
  assessedAt: string;
  decommissionedAt: string | null;
}

export interface IUpdateDeviceLifecycle {
  installedAt?: string | null;
  expectedLifespanMonths?: number | null;
}

/** src/constants/device-ota-status.ts */
export const DeviceOtaStatus = {
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  DOWNLOADING: 'DOWNLOADING',
  INSTALLING: 'INSTALLING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type DeviceOtaStatus = (typeof DeviceOtaStatus)[keyof typeof DeviceOtaStatus];

/** Response for GET/POST /devices/:id/ota — src/modules/device/dtos/device-ota.dto.ts */
export interface IDeviceOtaStatus {
  deviceId: string;
  status: DeviceOtaStatus;
  currentVersion: string | null;
  targetVersion: string | null;
  firmwareId: string | null;
  progress: number | null;
  error: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
}

/** One row of GET /devices/:id/ota/history. */
export interface IDeviceOtaUpdate {
  id: string;
  deviceId: string;
  firmwareId?: string | null;
  fromVersion?: string | null;
  toVersion: string;
  status: DeviceOtaStatus;
  progress?: number | null;
  error?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ITriggerOtaUpdate {
  firmwareId: string;
}

/** Minimal shape of a firmware catalog entry this feature consumes — device-templates feature owns the full DTO. */
export interface IFirmwareOption {
  id: string;
  templateId: string;
  version: string;
  isActive: boolean;
  releaseNotes?: string | null;
}

export interface IUnclaimedDevice {
  id: string;
  deviceId: string;
  lastTopic: string;
  lastPayload: string | null;
  lastSeenAt: string;
  ignoredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IDeviceTelemetry {
  id: string;
  deviceId: string;
  payload: Record<string, unknown>;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IRegisterDevice {
  deviceId: string;
  templateId: string;
  name: string;
  isActive?: boolean;
}

export interface ITriggerDeviceAction {
  key: string;
  value: string;
}

export interface ITriggerDeviceActionResult {
  key: string;
  value: string;
  topic: string;
  publishedAt: string;
}

/** Result of nudging a device (typically a GATEWAY) to re-fetch its boot-config now. */
export interface IPushConfigSyncResult {
  topic: string;
  configVersion: number;
  publishedAt: string;
}

export interface IDevicesQuery {
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
export interface IPageResponse<T> {
  data: T[];
  meta: IPageMeta;
}

/** src/common/dto/response-core.dto.ts */
export interface IResponseCore<T> {
  error: number;
  data: T | null;
  message: string;
}
