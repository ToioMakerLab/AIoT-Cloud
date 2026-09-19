import type { NotificationChannelType } from '../../../constants/notification-channel-type.ts';

/** One downlink topic for a single channel of a multi-channel device (e.g. one relay). */
export interface DeviceMqttChannelTopic {
  /** 1-based channel number, matching the order of the template's `actionSchema`. */
  index: number;
  /** The action key from the device template's `actionSchema` (e.g. "relay1"). */
  key: string;
  label: string;
  topic: string;
}

export interface DeviceMqttTopics {
  telemetry: string;
  command?: string | null;
  status?: string | null;
  /** Uplink ack topic for a downlink command's result — see `defaultEventTopic`'s doc comment. */
  event?: string | null;
  /** Downlink OTA update instruction topic — see `defaultOtaTopic`'s doc comment. */
  ota?: string | null;
  /** Auto-generated per-channel command topics; present only for multi-channel templates (e.g. RELAY_NODE). */
  channels?: DeviceMqttChannelTopic[] | null;
}

export interface DeviceMqttConfig {
  broker: string;
  port: number;
  username?: string | null;
  password?: string | null;
  topics: DeviceMqttTopics;
}

export interface DeviceHttpPushConfig {
  url: string;
  headers?: Record<string, string> | null;
}

export interface DeviceKafkaConfig {
  /** Comma-separated list of broker addresses, e.g. "broker1:9092,broker2:9092". */
  brokers: string;
  /** Topics this device (typically a gateway) produces to — e.g. telemetry, status, events. */
  topics: string[];
  /**
   * Topic the cloud publishes to for sending events/commands down to this device — only set for
   * gateways, since they're the ones that consume it and relay to the devices they bridge (see
   * `KAFKA_GATEWAY_COMMANDS_TOPIC`). Not part of `topics` above since that list is produce-only.
   */
  commandTopic?: string | null;
  /**
   * Unique producer clientId registered for this device/gateway, so every message it sends to
   * Kafka is attributable to it specifically rather than sharing the platform's default clientId
   * across every gateway. Generated once on first boot-config fetch and persisted from then on.
   */
  clientId?: string | null;
  /** SASL credentials, only needed when overriding the platform's default Kafka broker/auth. */
  username?: string | null;
  password?: string | null;
}

export interface DeviceNetworkConfig {
  apiEndpoint?: string | null;
  mqtt?: DeviceMqttConfig | null;
  http?: DeviceHttpPushConfig | null;
  kafka?: DeviceKafkaConfig | null;
}

/** Per-device override of a template's default warning band for one telemetry field key. */
export interface DeviceWarningThreshold {
  min?: number;
  max?: number;
  enabled?: boolean;
  /** Notification channels this gate fans out to; omitted/empty falls back to all enabled+linked channels. */
  channels?: NotificationChannelType[];
}

export type DeviceWarningOverrides = Record<string, DeviceWarningThreshold>;

/**
 * Alert rule for a device going offline. Distinct from `DeviceWarningThreshold` above since that
 * one gates on a telemetry field value — gateways (and any other device with no `telemetrySchema`
 * of their own) have nothing to threshold on directly, but still want to be notified when they
 * drop offline (see `DeviceStatusScheduler`/`DeviceWarningListener`).
 */
export interface DeviceOfflineAlertConfig {
  enabled: boolean;
  /** Unset/empty means "all of the user's enabled channels", same fallback as warning gates. */
  channels?: NotificationChannelType[] | null;
}

/**
 * A local automation rule a gateway evaluates and acts on itself, without a cloud round-trip —
 * e.g. trip a relay the instant an over-current reading comes in from a node it bridges. Stored
 * and shipped to the gateway (via boot-config) as a compact string so firmware can parse and cache
 * it directly, in the same shape it'd expect from an env var:
 *   "<field><operator><threshold>:<actionKey>=<actionValue>"
 * e.g. "amps.value>10:relay_2=OFF" -> once amps.value > 10, set relay_2 to OFF.
 * `field` is a telemetry key reported by (or bridged through) the gateway; `actionKey` is an
 * action key from some device's `actionSchema`. Parsing/evaluation happens entirely on the
 * gateway; the cloud only stores and relays the raw rule string.
 *
 * The action segment may also be the literal keyword `none` instead of `<actionKey>=<actionValue>`
 * — e.g. "telemetry.motorCurrent>0.4:none" — for a notify-only rule that raises a warning
 * notification without commanding any actuator. Once the gateway reports the rule fired (via
 * `devices.cloud.alerts`), the cloud always forwards it as a warning regardless of whether an
 * action is present — see `DeviceService.parseAlertRule`. On the gateway side, `none` is also
 * distinct from omitting the `:<action>` suffix entirely: an omitted suffix still falls back to
 * engaging the device's own `DeviceFailsafeConfig.rules`, while an explicit `none` opts out of that
 * fallback too (see AIoT-Gateway's `domain.AlertRule.NotifyOnly` / `docs/local-alerting-and-failsafe.md`).
 */
export type DeviceAlertRule = string;

/**
 * The safe state a gateway falls back to on its own when it loses the cloud (broker/API
 * unreachable) and can no longer wait on cloud-side alert rules or manual commands. `rules` reuses
 * the alert rule's action shorthand ("<actionKey>=<actionValue>") but unconditionally, since by the
 * time this applies the gateway has already decided it's failed safe.
 */
export interface DeviceFailsafeConfig {
  enabled: boolean;
  rules?: string[] | null;
}
