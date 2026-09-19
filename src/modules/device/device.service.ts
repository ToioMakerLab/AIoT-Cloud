import type { MessageEvent } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Observable } from 'rxjs';
import { defer, from, fromEvent, interval, merge } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import type { Repository } from 'typeorm';
import { Between, In, IsNull, LessThan, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type { AccessScope } from '../../common/access-scope.util.ts';
import type { PageDto } from '../../common/dto/page.dto.ts';
import { ResponseCore } from '../../common/dto/response-core.dto.ts';
import { encodeBase64 } from '../../common/utils.ts';
import { DeviceActionType } from '../../constants/device-action-type.ts';
import { DevicePushChannel } from '../../constants/device-push-channel.ts';
import { DEVICE_OFFLINE_THRESHOLD_MS, DeviceStatus } from '../../constants/device-status.ts';
import { DeviceTemplateType } from '../../constants/device-template-type.ts';
import { ErrorCode } from '../../constants/error-code.ts';
import {
  KAFKA_COMMAND_TOPIC,
  KAFKA_DEVICE_EVENTS_TOPIC,
  KAFKA_GATEWAY_COMMANDS_TOPIC,
  KAFKA_GATEWAY_EVENTS_TOPIC,
  KAFKA_OTA_STATUS_TOPIC,
  KAFKA_STATUS_TOPIC,
  KAFKA_TELEMETRY_TOPIC,
} from '../../constants/kafka-topics.ts';
import {
  defaultChannelCommandTopic,
  defaultCommandTopic,
  defaultEventTopic,
  defaultOtaTopic,
  defaultStatusTopic,
  defaultTelemetryTopic,
} from '../../constants/mqtt-topics.ts';
import { NotificationChannelType } from '../../constants/notification-channel-type.ts';
import { ApiConfigService } from '../../shared/services/api-config.service.ts';
import { DeviceTemplateEntity } from '../device-template/device-template.entity.ts';
import { KafkaProducerService } from '../kafka/kafka-producer.service.ts';
import { MqttProducerService } from '../mqtt/mqtt-producer.service.ts';
import type { MqttTopicRole, ResolvedMqttTopic } from '../mqtt/mqtt-topic-registry.service.ts';
import { MqttTopicRegistryService } from '../mqtt/mqtt-topic-registry.service.ts';
import { DeviceEntity } from './device.entity.ts';
import type { DeviceOtaStatusEvent } from './device-ota.service.ts';
import { DeviceTelemetryEntity } from './device-telemetry.entity.ts';
import type { DeviceDto } from './dtos/device.dto.ts';
import type { DeviceConfigDto, UpdateDeviceConfigDto } from './dtos/device-config.dto.ts';
import type { DeviceTelemetryDto } from './dtos/device-telemetry.dto.ts';
import type { DevicesPageOptionsDto } from './dtos/devices-page-options.dto.ts';
import type { RegisterDeviceDto } from './dtos/register-device.dto.ts';
import type { TriggerDeviceActionDto } from './dtos/trigger-device-action.dto.ts';
import type { UnclaimedDeviceDto } from './dtos/unclaimed-device.dto.ts';
import type { DeviceKafkaConfig, DeviceMqttTopics } from './interfaces/device-network-config.interface.ts';
import { UnclaimedDeviceEntity } from './unclaimed-device.entity.ts';

export interface DeviceTelemetryEvent {
  deviceId: string;
  payload: Record<string, unknown>;
  recordedAt: Date;
}

export interface DeviceStatusEvent {
  deviceId: string;
  status: DeviceStatus;
  changedAt: Date;
}

export interface DeviceChannelStateEvent {
  deviceId: string;
  channelStates: Record<string, string>;
  changedAt: Date;
}

/**
 * Fired for every `devices.cloud.events` message that names a channel (`key`), whether the
 * command it confirms actually applied or not — unlike `device.channelState` above (persisted
 * state, success only), this is a point-in-time result meant for a dashboard ACTION panel to
 * revert its optimistic value on immediately, instead of waiting out its own confirmation
 * timeout, so it's dispatched even on `status: "error"`.
 */
export interface DeviceActionResultEvent {
  deviceId: string;
  key: string;
  value?: string;
  status: 'ok' | 'error';
  error?: string;
  changedAt: Date;
}

/**
 * Payload of a `devices.cloud.events` or `devices.cloud.commands` message, deviceId already
 * stripped off by the Kafka consumer — both are handled identically by
 * `handleDeviceChannelEvent`, the former reporting the outcome of a command the backend relayed,
 * the latter a change the gateway made on its own initiative (see `KAFKA_COMMAND_TOPIC`'s doc
 * comment). `status`/`error` only ever apply to the former; a gateway-initiated change has no
 * "failed" case to report.
 */
export interface DeviceChannelEventPayload {
  key?: string;
  value?: unknown;
  topic?: string;
  status?: string;
  error?: string;
}

export interface DeviceAlertEvent {
  deviceId: string;
  message: string;
  channels?: NotificationChannelType[];
  occurredAt: Date;
}

export interface RegisterDeviceResult {
  device: DeviceDto;
}

/** How often the SSE stream sends a `ping` event, so proxies/load balancers don't time out an otherwise-idle connection. */
const SSE_HEARTBEAT_MS = 25_000;

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceTemplateEntity)
    private deviceTemplateRepository: Repository<DeviceTemplateEntity>,
    @InjectRepository(DeviceTelemetryEntity)
    private deviceTelemetryRepository: Repository<DeviceTelemetryEntity>,
    @InjectRepository(UnclaimedDeviceEntity)
    private unclaimedDeviceRepository: Repository<UnclaimedDeviceEntity>,
    private eventEmitter: EventEmitter2,
    private apiConfigService: ApiConfigService,
    private kafkaProducerService: KafkaProducerService,
    private mqttProducerService: MqttProducerService,
    private mqttTopicRegistryService: MqttTopicRegistryService,
  ) {}

  /** `factoryId` is copied from the registering user's own `UserEntity.factoryId`, so the device
   * follows its owner's factory and becomes readable by the whole factory, not just its owner. */
  @Transactional()
  async registerDevice(userId: string, factoryId: string | null, dto: RegisterDeviceDto): Promise<ResponseCore<RegisterDeviceResult>> {
    const template = await this.deviceTemplateRepository.findOneBy({ id: dto.templateId });

    if (!template) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceTemplateNotFound');
    }

    if (!template.isActive) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceTemplateInactive');
    }

    const existing = await this.deviceRepository.findOneBy({ deviceId: dto.deviceId });

    if (existing) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceAlreadyRegistered');
    }

    const entity = this.deviceRepository.create({
      deviceId: dto.deviceId,
      name: dto.name,
      templateId: dto.templateId,
      userId,
      factoryId,
      isActive: dto.isActive ?? true,
    });

    await this.deviceRepository.save(entity);
    entity.template = template;

    await this.unclaimedDeviceRepository.delete({ deviceId: dto.deviceId });

    return ResponseCore.ok({ device: entity.toDto() });
  }

  findByDeviceId(deviceId: string): Promise<DeviceEntity | null> {
    return this.deviceRepository.findOneBy({ deviceId });
  }

  async getBootConfig(deviceId: string): Promise<ResponseCore<DeviceConfigDto>> {
    const device = await this.deviceRepository.findOne({ where: { deviceId }, relations: ['template'] });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    const mqttFallback = this.apiConfigService.mqttConfig;

    const mqttBase = device.config?.mqtt
      ? { ...device.config.mqtt }
      : {
          broker: mqttFallback.url,
          port: 1883,
          username: mqttFallback.username,
          password: mqttFallback.password,
          topics: {
            telemetry: defaultTelemetryTopic(device.deviceId),
            command: defaultCommandTopic(device.deviceId),
            status: defaultStatusTopic(device.deviceId),
            event: defaultEventTopic(device.deviceId),
            ota: defaultOtaTopic(device.deviceId),
          },
        };

    // `event`/`ota` fall back to their derived defaults even for a stored (user-configured)
    // `mqttBase`, so a device config saved before these fields existed still gets them without
    // needing a re-save.
    const mqtt =
      device.pushChannel === DevicePushChannel.MQTT
        ? {
            ...mqttBase,
            topics: this.buildMqttTopics(device, {
              ...mqttBase.topics,
              event: mqttBase.topics.event ?? defaultEventTopic(device.deviceId),
              ota: mqttBase.topics.ota ?? defaultOtaTopic(device.deviceId),
            }),
          }
        : null;

    const kafka = device.pushChannel === DevicePushChannel.KAFKA ? await this.resolveKafkaConfig(device) : null;

    return ResponseCore.ok({
      deviceId: device.deviceId,
      name: device.name,
      type: device.template?.type ?? DeviceTemplateType.OTHER,
      apiEndpoint: device.config?.apiEndpoint ?? null,
      pushChannel: device.pushChannel,
      mqtt,
      http: device.pushChannel === DevicePushChannel.HTTP ? (device.config?.http ?? null) : null,
      kafka,
      configVersion: device.configVersion,
      offlineAlert: device.offlineAlert ?? null,
      alertRules: device.alertRules ?? null,
      failsafe: device.failsafe ?? null,
    });
  }

  /**
   * Appends per-channel command topics for multi-channel templates (e.g. a relay node) on top
   * of the device's base topics. Channel count/order/labels always follow the template's
   * `actionSchema`, so adding/removing an action on the template automatically resizes the list
   * the ESP32 firmware sees in boot-config, without needing a dedicated "channel count" field.
   * The topic itself keeps whatever value the user configured for that channel key (matched by
   * `key`, not by array position, so reordering actions on the template doesn't scramble
   * existing overrides); channels with no stored override fall back to the auto-derived topic.
   */
  private buildMqttTopics(device: DeviceEntity, baseTopics: DeviceMqttTopics): DeviceMqttTopics {
    const actionSchema = device.template?.actionSchema;

    const isChannelBasedTemplate =
      device.template?.type === DeviceTemplateType.RELAY_NODE || device.template?.type === DeviceTemplateType.RELAY_CURRENT_NODE;

    if (!isChannelBasedTemplate || !actionSchema?.length) {
      return baseTopics;
    }

    const overridesByKey = new Map((baseTopics.channels ?? []).map((channel) => [channel.key, channel.topic]));

    const channels = actionSchema.map((action, index) => ({
      index: index + 1,
      key: action.key,
      label: action.label,
      topic: overridesByKey.get(action.key) || defaultChannelCommandTopic(device.deviceId, index + 1),
    }));

    return { ...baseTopics, channels };
  }

  /**
   * Resolves (and, on first boot, registers) the Kafka config handed to a device on the KAFKA
   * push channel. A GATEWAY sits between many local devices and the cloud, so unlike a single
   * device it needs the full set of uplink topics (telemetry/status/events/gateway-initiated
   * changes) plus the shared downlink command topic — not just telemetry. It also gets its own
   * dedicated producer `clientId`, generated once and persisted to `device.config.kafka`, so every
   * message the gateway sends to Kafka is attributable to that specific gateway instead of every
   * gateway sharing the platform's single default clientId.
   */
  private async resolveKafkaConfig(device: DeviceEntity): Promise<DeviceKafkaConfig> {
    if (device.config?.kafka) {
      return { ...device.config.kafka, password: device.config.kafka.password };
    }

    const kafkaFallback = this.apiConfigService.kafkaConfig;
    const isGateway = device.template?.type === DeviceTemplateType.GATEWAY;

    const kafka: DeviceKafkaConfig = {
      brokers: kafkaFallback.brokers,
      topics: isGateway
        ? [KAFKA_TELEMETRY_TOPIC, KAFKA_STATUS_TOPIC, KAFKA_DEVICE_EVENTS_TOPIC, KAFKA_COMMAND_TOPIC, KAFKA_OTA_STATUS_TOPIC]
        : [KAFKA_TELEMETRY_TOPIC],
      // Only gateways consume this — they relay cloud -> device commands to whatever they bridge
      // locally, and also treat a command addressed to their own deviceId as self-directed (see
      // docs/gateway-kafka-integration.md). Standalone (non-gateway) Kafka devices have nothing to
      // relay to, so they're never told about it. Set to the shared inbox
      // (`KAFKA_GATEWAY_COMMANDS_TOPIC`) explicitly, purely so it's visible in the boot-config
      // response — `triggerDeviceAction` already falls back to that same topic for any device
      // with no `commandTopic` of its own, gateway included.
      commandTopic: isGateway ? KAFKA_GATEWAY_COMMANDS_TOPIC : null,
      clientId: isGateway ? `${kafkaFallback.clientId}-gw-${device.deviceId}` : kafkaFallback.clientId,
      username: kafkaFallback.sasl?.username ?? null,
      password: kafkaFallback.sasl?.password ?? null,
    };

    device.config = { ...device.config, kafka: { ...kafka, password: encodeBase64(kafka.password) } };
    await this.deviceRepository.save(device);

    return kafka;
  }

  @Transactional()
  async updateDeviceConfig(userId: string, id: string, dto: UpdateDeviceConfigDto): Promise<ResponseCore<DeviceDto>> {
    const device = await this.deviceRepository.findOneBy({ id, userId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    // Kafka broker passwords are stored base64-encoded rather than plaintext, and never decoded
    // back out anywhere in a response — not to the client (see `DeviceDto`, which now returns this
    // value still encoded), and not to the device/gateway either (`resolveKafkaConfig`, deliberately
    // left as-is, also just passes the stored value through).
    const mqtt = dto.mqtt;
    const kafka = dto.kafka !== undefined && dto.kafka !== null ? { ...dto.kafka, password: encodeBase64(dto.kafka.password) } : dto.kafka;

    device.config = {
      ...device.config,
      ...(dto.apiEndpoint !== undefined && { apiEndpoint: dto.apiEndpoint }),
      ...(dto.mqtt !== undefined && { mqtt }),
      ...(dto.http !== undefined && { http: dto.http }),
      ...(dto.kafka !== undefined && { kafka }),
    };

    if (dto.pushChannel !== undefined) {
      device.pushChannel = dto.pushChannel;
    }

    if (dto.isActive !== undefined) {
      device.isActive = dto.isActive;
    }

    if (dto.warningOverrides !== undefined) {
      device.warningOverrides = dto.warningOverrides;
    }

    if (dto.offlineAlert !== undefined) {
      device.offlineAlert = dto.offlineAlert;
    }

    if (dto.alertRules !== undefined) {
      device.alertRules = dto.alertRules;
    }

    if (dto.failsafe !== undefined) {
      device.failsafe = dto.failsafe;
    }

    device.configVersion += 1;

    await this.deviceRepository.save(device);

    // A device's custom topic overrides (`mqtt.topics.*`) may have just changed, which would
    // stale-out MqttTopicRegistryService's cache — see its doc comment. Cheap to just clear the
    // whole (small) cache rather than track per-device invalidation.
    if (dto.mqtt !== undefined) {
      this.mqttTopicRegistryService.clear();
    }

    return ResponseCore.ok(device.toDto());
  }

  async triggerDeviceAction(
    userId: string,
    id: string,
    dto: TriggerDeviceActionDto,
  ): Promise<ResponseCore<{ key: string; value: string; topic: string; publishedAt: Date }>> {
    const device = await this.deviceRepository.findOne({ where: { id, userId }, relations: ['template'] });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    const actionDef = device.template?.actionSchema?.find((action) => action.key === dto.key);

    if (!actionDef) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceActionNotFound');
    }

    if (actionDef.type === DeviceActionType.TOGGLE && dto.value !== actionDef.onValue && dto.value !== actionDef.offValue) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceActionInvalidValue');
    }

    if (device.pushChannel !== DevicePushChannel.MQTT && device.pushChannel !== DevicePushChannel.KAFKA) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceActionChannelUnsupported');
    }

    // The device's own downlink topic for this specific action/channel — the per-channel topic
    // (`config.mqtt.topics.channels[].topic`) if the template defines one for this key, else
    // falling back to the device's general MQTT command topic. For a KAFKA-push device this is
    // carried in the outbound payload so whatever gateway/bridge relays the message onto its own
    // local MQTT knows where to publish; for an MQTT-push device it IS the topic we publish to
    // directly below (the device is connected straight to this broker, no gateway involved).
    const channelTopic = device.config?.mqtt?.topics?.channels?.find((channel) => channel.key === dto.key)?.topic;
    const deviceMqttTopic = channelTopic ?? device.config?.mqtt?.topics?.command ?? undefined;

    // The actual Kafka topic the command is published on. A gateway (or any device configured
    // directly on the KAFKA push channel) gets its own dedicated commandTopic — accept whatever
    // is configured on the device instead of always hardcoding the shared bus, so a gateway can
    // be pointed at its own topic (e.g. "device.gateway.command"). Falls back to the shared
    // per-gateway inbox (`KAFKA_GATEWAY_COMMANDS_TOPIC`, NOT `KAFKA_COMMAND_TOPIC` — that one is
    // only set as a gateway's own commandTopic for actions targeted at itself, see its doc
    // comment) for devices with no Kafka config of their own (e.g. MQTT-only relay nodes, which
    // are bridged by a separate gateway device that IS listening on the shared inbox).
    const kafkaTopic = device.config?.kafka?.commandTopic ?? KAFKA_GATEWAY_COMMANDS_TOPIC;
    const publishedAt = new Date();

    try {
      await this.kafkaProducerService.send(
        kafkaTopic,
        { deviceId: device.deviceId, key: dto.key, value: dto.value, topic: deviceMqttTopic },
        device.deviceId,
      );
      if (device.pushChannel === DevicePushChannel.MQTT) {
        await this.triggerDeviceActionViaMqtt(device, dto, deviceMqttTopic);
      }
    } catch (error) {
      this.logger.error(
        `Failed to publish action ${dto.key}=${dto.value} to ${kafkaTopic}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return ResponseCore.fail(ErrorCode.INTERNAL_SERVER_ERROR, 'error.deviceActionPublishFailed');
    }

    // Best-effort, non-fatal: the real command above already went out, so a failure here shouldn't
    // fail the request — just log it.
    try {
      // Audit/observability companion to the command above, on its own dedicated topic (never
      // consumed by this backend — see `KAFKA_GATEWAY_EVENTS_TOPIC`'s doc comment) so the gateway
      // can tell "dashboard dispatched this" apart from its own relay bookkeeping without parsing
      // a second copy of the command out of `kafkaTopic`.
      await this.kafkaProducerService.send(
        KAFKA_GATEWAY_EVENTS_TOPIC,
        { deviceId: device.deviceId, key: dto.key, value: dto.value, topic: deviceMqttTopic, requestedAt: publishedAt },
        device.deviceId,
      );

      // Self-published onto the same topic `KafkaConsumerService` already listens to for real
      // gateway confirmations (`devices.cloud.events`), so it round-trips through the exact same
      // `handleDeviceChannelEvent` path instead of a second, hand-rolled optimistic-update path —
      // applies `channelStates` and dispatches `device.channelState`/`device.actionResult`
      // immediately, so the dashboard doesn't wait out the real gateway round-trip. A genuine
      // confirmation (or `status: "error"`) from the gateway follows shortly after and is the
      // authoritative one — this is just applied first.
      await this.kafkaProducerService.send(
        KAFKA_DEVICE_EVENTS_TOPIC,
        { deviceId: device.deviceId, key: dto.key, value: dto.value, status: 'ok' },
        device.deviceId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish optimistic action-dispatch notification for ${dto.key}=${dto.value}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return ResponseCore.ok({ key: dto.key, value: dto.value, topic: kafkaTopic, publishedAt });
  }

  /**
   * Downlink path for a device connected straight to this broker (`pushChannel: MQTT`, no
   * gateway in between) — publishes `{ key, value }` directly onto the device's own command
   * topic via `MqttProducerService`, the direct-broker counterpart to the Kafka gateway-relay
   * path above. There's no round trip through a gateway to bounce an optimistic update off, so
   * `channelStates` is applied in-process right after the publish succeeds (same effect as the
   * Kafka path's self-publish onto `KAFKA_DEVICE_EVENTS_TOPIC`, just a direct call instead of a
   * broker round-trip). The device itself can still publish an authoritative confirmation (or
   * `status: "error"`) on its `event` topic afterwards — see `MqttController`/`EVENT_TOPIC_REGEX`
   * — which re-applies via the same `handleDeviceChannelEvent` and can flip an optimistic "ok"
   * back to an error if the command didn't actually land.
   */
  private async triggerDeviceActionViaMqtt(
    device: DeviceEntity,
    dto: TriggerDeviceActionDto,
    deviceMqttTopic: string | undefined,
  ): Promise<ResponseCore<{ key: string; value: string; topic: string; publishedAt: Date }>> {
    if (!deviceMqttTopic) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceActionTopicNotConfigured');
    }

    // MqttProducerService never connects when MQTT_ENABLED is false (see its onModuleInit), so
    // publish() would only ever throw "not connected" here — fail fast with a message that points
    // at the actual cause instead of logging it as an unexpected internal error every time.
    if (!this.apiConfigService.mqttEnabled) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.mqttDisabled');
    }

    const publishedAt = new Date();

    try {
      await this.mqttProducerService.publish(deviceMqttTopic, { deviceId: device.deviceId, key: dto.key, value: dto.value });
    } catch (error) {
      this.logger.error(
        `Failed to publish action ${dto.key}=${dto.value} to ${deviceMqttTopic}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return ResponseCore.fail(ErrorCode.INTERNAL_SERVER_ERROR, 'error.deviceActionPublishFailed');
    }

    try {
      await this.handleDeviceChannelEvent(device.deviceId, { key: dto.key, value: dto.value, status: 'ok' });
    } catch (error) {
      this.logger.warn(
        `Failed to apply optimistic channel state for ${dto.key}=${dto.value}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return ResponseCore.ok({ key: dto.key, value: dto.value, topic: deviceMqttTopic, publishedAt });
  }

  /**
   * Pushes a "your config changed, re-fetch now" nudge to a device instead of waiting for its own
   * boot/poll cycle to notice — mainly for GATEWAY devices, whose alert rules/failsafe (see
   * GatewayAutomationPanel) only take effect once the gateway re-pulls `GET .../boot-config`.
   * Deliberately a signal, not the config itself: the device still re-fetches boot-config as the
   * single source of truth, so this can never drift out of sync with it.
   *
   * Published on the dedicated `KAFKA_GATEWAY_COMMANDS_TOPIC` (not the per-device/shared-bus
   * `KAFKA_COMMAND_TOPIC` `triggerDeviceAction` uses) — unlike an actuator command, which a
   * gateway can relay onward to an MQTT node it bridges, this only ever means something to a
   * device that's itself a Kafka consumer, i.e. a gateway. Hence KAFKA-push-channel only below;
   * a plain MQTT-push node has no Kafka connection of its own to receive this on.
   */
  async pushConfigSync(userId: string, id: string): Promise<ResponseCore<{ topic: string; configVersion: number; publishedAt: Date }>> {
    const device = await this.deviceRepository.findOneBy({ id, userId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    if (device.pushChannel !== DevicePushChannel.KAFKA) {
      return ResponseCore.fail(ErrorCode.BAD_REQUEST, 'error.deviceActionChannelUnsupported');
    }

    const publishedAt = new Date();

    try {
      await this.kafkaProducerService.send(
        KAFKA_GATEWAY_COMMANDS_TOPIC,
        { deviceId: device.deviceId, type: 'config_sync', configVersion: device.configVersion },
        device.deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish config sync to ${KAFKA_GATEWAY_COMMANDS_TOPIC}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return ResponseCore.fail(ErrorCode.INTERNAL_SERVER_ERROR, 'error.deviceActionPublishFailed');
    }

    return ResponseCore.ok({ topic: KAFKA_GATEWAY_COMMANDS_TOPIC, configVersion: device.configVersion, publishedAt });
  }

  /** `scope: null` means unrestricted (GUEST) — every device system-wide, not just the caller's own. */
  @Transactional()
  async getUserDevices(scope: AccessScope, pageOptionsDto: DevicesPageOptionsDto): Promise<PageDto<DeviceDto>> {
    const queryBuilder = this.deviceRepository
      .createQueryBuilder('device')
      .leftJoinAndSelect('device.template', 'template')
      .orderBy('device.createdAt', pageOptionsDto.order);

    if (scope && 'factoryId' in scope) {
      queryBuilder.where('device.factoryId = :factoryId', { factoryId: scope.factoryId });
    } else if (scope) {
      queryBuilder.where('device.userId = :userId', { userId: scope.userId });
    }

    const [items, pageMetaDto] = await queryBuilder.paginate(pageOptionsDto);

    return items.toPageDto(pageMetaDto);
  }

  /** `scope: null` means unrestricted (GUEST) — can look up any device, not just the caller's own. */
  async getDevice(scope: AccessScope, id: string): Promise<ResponseCore<DeviceDto>> {
    const entity = await this.deviceRepository.findOne({ where: scope ? { id, ...scope } : { id }, relations: ['template'] });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    return ResponseCore.ok(entity.toDto());
  }

  @Transactional()
  async deleteDevice(userId: string, id: string): Promise<ResponseCore<null>> {
    const entity = await this.deviceRepository.findOneBy({ id, userId });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    await this.deviceRepository.remove(entity);

    return ResponseCore.ok(null);
  }

  /**
   * `scope: null` means unrestricted (GUEST) — can read telemetry history for any device.
   * `range` powers the dashboard's time-range filter: with both bounds it's an inclusive window,
   * with just one it's an open-ended bound, and with neither it falls back to the previous
   * behavior of "the most recent `limit` points". `limit` still applies as a hard cap even within
   * a range, ordered newest-first before the cap so a wide range returns its most recent points
   * rather than erroring or streaming everything.
   */
  async getDeviceTelemetryHistory(
    scope: AccessScope,
    id: string,
    limit: number,
    range?: { from?: Date; to?: Date },
  ): Promise<ResponseCore<DeviceTelemetryDto[]>> {
    const device = await this.deviceRepository.findOneBy(scope ? { id, ...scope } : { id });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    const recordedAt =
      range?.from && range.to
        ? Between(range.from, range.to)
        : range?.from
          ? MoreThanOrEqual(range.from)
          : range?.to
            ? LessThanOrEqual(range.to)
            : undefined;

    const entities = await this.deviceTelemetryRepository.find({
      where: { deviceId: device.id, ...(recordedAt && { recordedAt }) },
      order: { recordedAt: 'DESC' },
      take: limit,
    });

    return ResponseCore.ok(entities.reverse().toDtos());
  }

  async getUserDeviceIds(userId: string): Promise<string[]> {
    const devices = await this.deviceRepository.find({ where: { userId }, select: ['deviceId'] });

    return devices.map((device) => device.deviceId);
  }

  async isOwnedByUser(userId: string, deviceId: string): Promise<boolean> {
    const count = await this.deviceRepository.countBy({ deviceId, userId });

    return count > 0;
  }

  /**
   * Resolves an entity id (what the frontend/dashboard widgets key on) to the device's physical
   * id (what MQTT topics + websocket rooms key on), scoped to devices the caller can access
   * (`scope: null` means unrestricted — GUEST can subscribe to any device). Used by the
   * websocket gateway's `subscribe:device` handler, which receives entity ids from the client.
   */
  async resolveOwnedDeviceByEntityId(scope: AccessScope, entityId: string): Promise<Pick<DeviceEntity, 'id' | 'deviceId'> | null> {
    return this.deviceRepository.findOne({ where: scope ? { id: entityId, ...scope } : { id: entityId }, select: ['id', 'deviceId'] });
  }

  /**
   * Live SSE feed for the dashboard: telemetry + status + channel-state/action-result updates for
   * the given device ids, scoped to devices the caller can access (`scope: null` means
   * unrestricted — GUEST sees every device). `deviceIds` are entity ids (the same ids the REST
   * device endpoints use), which this resolves to the physical device ids that
   * `device.telemetry`/`device.status`/`device.channelState`/`device.actionResult` events key on,
   * then maps back to entity ids in the emitted payload. Mirrors what `AppGateway` (the websocket
   * transport) forwards for the same four domain events, so a dashboard on either transport sees a
   * relay/channel state change the moment `handleDeviceChannelEvent` applies it, not just telemetry
   * and online/offline.
   */
  streamDeviceEvents(scope: AccessScope, deviceIds: string[]): Observable<MessageEvent> {
    return defer(() => from(this.resolveEntityIdByPhysicalDeviceId(scope, deviceIds))).pipe(
      switchMap((entityIdByPhysicalDeviceId) => {
        const telemetry$ = fromEvent<DeviceTelemetryEvent>(this.eventEmitter, 'device.telemetry').pipe(
          filter((event) => entityIdByPhysicalDeviceId.has(event.deviceId)),
          map(
            (event) =>
              ({
                type: 'telemetry',
                data: {
                  deviceId: entityIdByPhysicalDeviceId.get(event.deviceId),
                  payload: event.payload,
                  recordedAt: event.recordedAt,
                },
              }) satisfies MessageEvent,
          ),
        );

        const status$ = fromEvent<DeviceStatusEvent>(this.eventEmitter, 'device.status').pipe(
          filter((event) => entityIdByPhysicalDeviceId.has(event.deviceId)),
          map(
            (event) =>
              ({
                type: 'status',
                data: {
                  deviceId: entityIdByPhysicalDeviceId.get(event.deviceId),
                  status: event.status,
                  changedAt: event.changedAt,
                },
              }) satisfies MessageEvent,
          ),
        );

        // Persisted channel state (relay/actuator) — see `handleDeviceChannelEvent`'s
        // `status: "ok"` path. Mirrors `AppGateway.handleDeviceChannelState`'s `channelState`
        // socket.io event.
        const channelState$ = fromEvent<DeviceChannelStateEvent>(this.eventEmitter, 'device.channelState').pipe(
          filter((event) => entityIdByPhysicalDeviceId.has(event.deviceId)),
          map(
            (event) =>
              ({
                type: 'channelState',
                data: {
                  deviceId: entityIdByPhysicalDeviceId.get(event.deviceId),
                  channelStates: event.channelStates,
                  changedAt: event.changedAt,
                },
              }) satisfies MessageEvent,
          ),
        );

        // Point-in-time relay/channel command result, success or failure — see
        // `DeviceActionResultEvent`'s doc comment. Mirrors `AppGateway.handleDeviceActionResult`'s
        // `actionResult` socket.io event, for an SSE-only ACTION panel to resolve its own
        // optimistic value without waiting out its confirmation timeout.
        const actionResult$ = fromEvent<DeviceActionResultEvent>(this.eventEmitter, 'device.actionResult').pipe(
          filter((event) => entityIdByPhysicalDeviceId.has(event.deviceId)),
          map(
            (event) =>
              ({
                type: 'actionResult',
                data: {
                  deviceId: entityIdByPhysicalDeviceId.get(event.deviceId),
                  key: event.key,
                  value: event.value,
                  status: event.status,
                  error: event.error,
                  changedAt: event.changedAt,
                },
              }) satisfies MessageEvent,
          ),
        );

        // OTA progress/result — see `DeviceOtaStatusEvent`'s doc comment. Mirrors
        // `AppGateway.handleDeviceOtaStatus`'s `otaStatus` socket.io event.
        const otaStatus$ = fromEvent<DeviceOtaStatusEvent>(this.eventEmitter, 'device.otaStatus').pipe(
          filter((event) => entityIdByPhysicalDeviceId.has(event.deviceId)),
          map(
            (event) =>
              ({
                type: 'otaStatus',
                data: {
                  deviceId: entityIdByPhysicalDeviceId.get(event.deviceId),
                  status: event.status,
                  version: event.version,
                  progress: event.progress,
                  error: event.error,
                  changedAt: event.changedAt,
                },
              }) satisfies MessageEvent,
          ),
        );

        const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
          map(() => ({ type: 'ping', data: { now: new Date().toISOString() } }) satisfies MessageEvent),
        );

        return merge(telemetry$, status$, channelState$, actionResult$, otaStatus$, heartbeat$);
      }),
    );
  }

  /**
   * Devices the caller can access, restricted to `entityIds` (when given), keyed by their
   * physical device id. `scope: null` means unrestricted (GUEST) — any device matching `entityIds`.
   */
  private async resolveEntityIdByPhysicalDeviceId(scope: AccessScope, entityIds: string[]): Promise<Map<string, string>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const devices = await this.deviceRepository.find({
      where: scope ? { id: In(entityIds), ...scope } : { id: In(entityIds) },
      select: ['id', 'deviceId'],
    });

    return new Map(devices.map((device) => [device.deviceId, device.id]));
  }

  /** Used by notification warning checks, which need the template's telemetry schema alongside the device. */
  async findByDeviceIdWithTemplate(deviceId: string): Promise<DeviceEntity | null> {
    return this.deviceRepository.findOne({ where: { deviceId }, relations: ['template'] });
  }

  /**
   * Reverse-lookup for `MqttController.handleAny`: given a topic that didn't match any of the
   * default `devices/{deviceId}/...` shapes, find the `MQTT`-push device (if any) that has it
   * configured as a custom override in `config.mqtt.topics` — `telemetry`/`status`/`event` (all
   * uplink) or `command`/`channels[].topic` (downlink, whose result is just "ignore, it's our
   * own echo" — see `MqttController`). A device's own JSONB column is queried directly rather
   * than kept in an application-side index, since overrides are rare and this only ever runs for
   * a topic `MqttTopicRegistryService` hasn't already cached (a hit or a recent miss).
   */
  async resolveCustomMqttTopic(topic: string): Promise<ResolvedMqttTopic | null> {
    const device = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.pushChannel = :pushChannel', { pushChannel: DevicePushChannel.MQTT })
      .andWhere(
        `(
           device.config #>> '{mqtt,topics,telemetry}' = :topic
           OR device.config #>> '{mqtt,topics,status}' = :topic
           OR device.config #>> '{mqtt,topics,event}' = :topic
           OR device.config #>> '{mqtt,topics,command}' = :topic
           OR device.config #>> '{mqtt,topics,ota}' = :topic
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(device.config #> '{mqtt,topics,channels}', '[]'::jsonb)) AS channel
             WHERE channel ->> 'topic' = :topic
           )
         )`,
        { topic },
      )
      .getOne();

    if (!device?.config?.mqtt?.topics) {
      return null;
    }

    const topics = device.config.mqtt.topics;
    const role: MqttTopicRole | undefined =
      topics.telemetry === topic
        ? 'telemetry'
        : topics.status === topic
          ? 'status'
          : topics.event === topic
            ? 'event'
            : // `ota` is downlink-only, same as `command`/`channels` — reusing the 'command' role here
              // just means "ignore the broker's echo of our own publish", not that it's actually a
              // command topic.
              topics.command === topic || topics.ota === topic || topics.channels?.some((channel) => channel.topic === topic)
              ? 'command'
              : undefined;

    return role ? { deviceId: device.deviceId, role } : null;
  }

  async recordTelemetry(deviceId: string, payload: unknown): Promise<void> {
    const device = await this.deviceRepository.findOneBy({ deviceId });

    if (!device) {
      const isIgnored = await this.recordUnclaimedDevice(deviceId, 'telemetry', payload);

      if (!isIgnored) {
        this.logger.warn(`Ignoring telemetry for unclaimed device ${deviceId}`);
      }

      return;
    }

    const recordedAt = new Date();
    const normalizedPayload = (payload && typeof payload === 'object' ? payload : { value: payload }) as Record<string, unknown>;

    const telemetry = this.deviceTelemetryRepository.create({
      deviceId: device.id,
      payload: normalizedPayload,
      recordedAt,
    });

    const wasOffline = device.status !== DeviceStatus.ONLINE;

    await Promise.all([
      this.deviceTelemetryRepository.save(telemetry),
      this.deviceRepository.update(device.id, { lastSeenAt: recordedAt, status: DeviceStatus.ONLINE }),
    ]);

    this.eventEmitter.emit('device.telemetry', {
      deviceId,
      payload: normalizedPayload,
      recordedAt,
    } satisfies DeviceTelemetryEvent);

    if (wasOffline) {
      this.eventEmitter.emit('device.status', {
        deviceId,
        status: DeviceStatus.ONLINE,
        changedAt: recordedAt,
      } satisfies DeviceStatusEvent);
    }
  }

  /** Handles the MQTT status topic: explicit online announcements and LWT-triggered offline messages. */
  async handleDeviceStatusMessage(deviceId: string, payload: unknown): Promise<void> {
    const device = await this.deviceRepository.findOneBy({ deviceId });

    if (!device) {
      const isIgnored = await this.recordUnclaimedDevice(deviceId, 'status', payload);

      if (!isIgnored) {
        this.logger.warn(`Ignoring status for unclaimed device ${deviceId}`);
      }

      return;
    }

    const status = this.parseStatusPayload(payload);

    if (!status) {
      this.logger.warn(`Ignoring unrecognized status payload from device ${deviceId}: ${JSON.stringify(payload)}`);

      return;
    }

    const changedAt = new Date();

    if (status === DeviceStatus.ONLINE) {
      await this.deviceRepository.update(device.id, { status, lastSeenAt: changedAt });
    } else {
      await this.deviceRepository.update(device.id, { status });
    }

    if (status !== device.status) {
      this.eventEmitter.emit('device.status', { deviceId, status, changedAt } satisfies DeviceStatusEvent);
    }
  }

  /**
   * Handles a per-channel state-change envelope from either of two gateway->cloud topics:
   * `devices.cloud.events` — confirmation that a `devices.gateway.commands` relay actually landed
   * on the device (or didn't) — or `devices.cloud.commands` — a change the gateway made on its own
   * initiative, with no preceding cloud command (see `KAFKA_COMMAND_TOPIC`'s doc comment). Both
   * shapes are otherwise identical and handled the same way. On `status: "ok"` (the only possible
   * outcome for a gateway-initiated change; `devices.cloud.commands` never carries `status`),
   * `key`/`value` describe the channel's newly-applied actuator state and are merged into the
   * device's persisted `channelStates`, broadcast to the dashboard as a `device.channelState`
   * event. On `status: "error"` the command wasn't applied — `channelStates` is left untouched,
   * since surfacing it there would show a state the device never actually reached. Either way (as
   * long as a `key` was named), also dispatches `device.actionResult` — a lighter, point-in-time
   * event an ACTION panel uses to resolve its own optimistic value immediately instead of waiting
   * out its confirmation timeout, success or failure alike. Receiving the event at all proves the
   * gateway is actively bridging the device, so it's still marked ONLINE regardless of outcome.
   */
  async handleDeviceChannelEvent(deviceId: string, event: DeviceChannelEventPayload): Promise<void> {
    const device = await this.deviceRepository.findOneBy({ deviceId });

    if (!device) {
      const isIgnored = await this.recordUnclaimedDevice(deviceId, event.topic ?? KAFKA_DEVICE_EVENTS_TOPIC, event);

      if (!isIgnored) {
        this.logger.warn(`Ignoring device event for unclaimed device ${deviceId}`);
      }

      return;
    }

    const changedAt = new Date();
    const wasOffline = device.status !== DeviceStatus.ONLINE;
    const failed = (event.status ?? 'ok').trim().toLowerCase() === 'error';

    if (failed) {
      this.logger.warn(
        `Device ${deviceId} failed to apply channel command ${event.key ?? '?'}=${String(event.value ?? '?')}: ${event.error ?? 'unknown error'}`,
      );
      await this.deviceRepository.update(device.id, { lastSeenAt: changedAt, status: DeviceStatus.ONLINE });

      if (event.key) {
        this.eventEmitter.emit('device.actionResult', {
          deviceId,
          key: event.key,
          value: event.value !== undefined ? String(event.value) : undefined,
          status: 'error',
          error: event.error,
          changedAt,
        } satisfies DeviceActionResultEvent);
      }
    } else if (event.key) {
      const value = String(event.value ?? '');
      const channelStates = { ...(device.channelStates ?? {}), [event.key]: value };

      await this.deviceRepository.update(device.id, { channelStates, lastSeenAt: changedAt, status: DeviceStatus.ONLINE });
      this.eventEmitter.emit('device.channelState', { deviceId, channelStates, changedAt } satisfies DeviceChannelStateEvent);
      // Dispatched alongside `device.channelState` (not folded into it) so an ACTION panel can
      // react to "my command specifically was confirmed" without re-deriving that from a
      // `channelStates` snapshot that may bundle other channels' updates too — see
      // `DeviceActionResultEvent`'s doc comment.
      this.eventEmitter.emit('device.actionResult', {
        deviceId,
        key: event.key,
        value,
        status: 'ok',
        changedAt,
      } satisfies DeviceActionResultEvent);
    } else {
      this.logger.warn(`Ignoring unrecognized device event from ${deviceId}: ${JSON.stringify(event)}`);

      return;
    }

    if (wasOffline) {
      this.eventEmitter.emit('device.status', { deviceId, status: DeviceStatus.ONLINE, changedAt } satisfies DeviceStatusEvent);
    }
  }

  /**
   * Handles `devices.cloud.alert`: an alert the device/gateway itself already decided to raise
   * (hardware fault, tamper, a threshold check done in firmware, etc.), as opposed to the
   * threshold breaches `DeviceWarningListener` derives itself from `device.telemetry`. Doesn't
   * touch device state — just forwards the message to the owner's notification channels via the
   * `device.alert` domain event.
   */
  async handleDeviceAlert(deviceId: string, payload: unknown): Promise<void> {
    const device = await this.deviceRepository.findOneBy({ deviceId });

    if (!device) {
      const isIgnored = await this.recordUnclaimedDevice(deviceId, 'alert', payload);

      if (!isIgnored) {
        this.logger.warn(`Ignoring alert for unclaimed device ${deviceId}`);
      }

      return;
    }

    const parsed = this.parseAlertPayload(payload);

    if (!parsed) {
      this.logger.warn(`Ignoring unrecognized alert payload from device ${deviceId}: ${JSON.stringify(payload)}`);

      return;
    }

    this.eventEmitter.emit('device.alert', {
      deviceId,
      message: `[Alert] ${device.name}: ${parsed.message}`,
      channels: parsed.channels,
      occurredAt: new Date(),
    } satisfies DeviceAlertEvent);
  }

  /** Marks devices OFFLINE once they haven't been heard from (telemetry or status) for `DEVICE_OFFLINE_THRESHOLD_MS`. */
  async sweepOfflineDevices(): Promise<void> {
    const cutoff = new Date(Date.now() - DEVICE_OFFLINE_THRESHOLD_MS);

    const staleDevices = await this.deviceRepository.find({
      where: { status: DeviceStatus.ONLINE, lastSeenAt: LessThan(cutoff) },
      select: { id: true, deviceId: true },
    });

    if (staleDevices.length === 0) {
      return;
    }

    const changedAt = new Date();

    await this.deviceRepository.update({ id: In(staleDevices.map((device) => device.id)) }, { status: DeviceStatus.OFFLINE });

    for (const device of staleDevices) {
      this.eventEmitter.emit('device.status', {
        deviceId: device.deviceId,
        status: DeviceStatus.OFFLINE,
        changedAt,
      } satisfies DeviceStatusEvent);
    }
  }

  /** `includeIgnored` surfaces devices previously dismissed via `ignoreUnclaimedDevice` — hidden from the default listing. */
  async listUnclaimedDevices(includeIgnored = false): Promise<ResponseCore<UnclaimedDeviceDto[]>> {
    const devices = await this.unclaimedDeviceRepository.find({
      where: includeIgnored ? {} : { ignoredAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });

    return ResponseCore.ok(devices.toDtos());
  }

  /** Dismisses a noisy/foreign device (e.g. another system sharing the broker) from the default unclaimed listing. */
  async ignoreUnclaimedDevice(deviceId: string): Promise<ResponseCore<UnclaimedDeviceDto>> {
    const entity = await this.unclaimedDeviceRepository.findOneBy({ deviceId });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.unclaimedDeviceNotFound');
    }

    entity.ignoredAt = new Date();
    await this.unclaimedDeviceRepository.update(entity.id, { ignoredAt: entity.ignoredAt });

    return ResponseCore.ok(entity.toDto());
  }

  /** Reverses `ignoreUnclaimedDevice`, e.g. once the device is expected to be claimed after all. */
  async unignoreUnclaimedDevice(deviceId: string): Promise<ResponseCore<UnclaimedDeviceDto>> {
    const entity = await this.unclaimedDeviceRepository.findOneBy({ deviceId });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.unclaimedDeviceNotFound');
    }

    entity.ignoredAt = null;
    await this.unclaimedDeviceRepository.update(entity.id, { ignoredAt: null });

    return ResponseCore.ok(entity.toDto());
  }

  /** Upserts the sighting and reports whether the device is on the ignore list, so callers can skip the noisy per-message warn log. */
  private async recordUnclaimedDevice(deviceId: string, topic: string, payload: unknown): Promise<boolean> {
    const lastSeenAt = new Date();
    const lastPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const existing = await this.unclaimedDeviceRepository.findOneBy({ deviceId });

    if (existing) {
      await this.unclaimedDeviceRepository.update(existing.id, { lastTopic: topic, lastPayload, lastSeenAt });

      return existing.ignoredAt !== null;
    }

    const entity = this.unclaimedDeviceRepository.create({ deviceId, lastTopic: topic, lastPayload, lastSeenAt });

    await this.unclaimedDeviceRepository.save(entity);

    return false;
  }

  private parseStatusPayload(payload: unknown): DeviceStatus | null {
    const raw =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object' && 'status' in payload
          ? (payload as { status: unknown }).status
          : undefined;

    if (typeof raw !== 'string') {
      return null;
    }

    const normalized = raw.trim().toUpperCase();

    return normalized === DeviceStatus.ONLINE || normalized === DeviceStatus.OFFLINE ? (normalized as DeviceStatus) : null;
  }

  /** Parses a raw `"relay1=OFF"`-style device-event message into its channel key/value. */
  private parseChannelStateMessage(message: unknown): { key: string; value: string } | null {
    if (typeof message !== 'string') {
      return null;
    }

    const separatorIndex = message.indexOf('=');

    if (separatorIndex <= 0) {
      return null;
    }

    const key = message.slice(0, separatorIndex).trim();
    const value = message.slice(separatorIndex + 1).trim();

    return key && value ? { key, value } : null;
  }

  /**
   * Parses `devices.cloud.alerts`'s payload into a renderable message. Two shapes are accepted:
   * a pre-rendered `{ message }`, or the rule-fired shape `{ metric, reading, rule }` — e.g.
   * `{ metric: "sensor", reading: { apms: 11.6, ... }, rule: "sensor.apms>10:relay2=ON" }` — which
   * is rendered via `parseAlertRule`/`reading[field]`. `channels` is accepted either way.
   */
  private parseAlertPayload(payload: unknown): { message: string; channels?: NotificationChannelType[] } | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const { message, metric, reading, rule, channels } = payload as {
      message?: unknown;
      metric?: unknown;
      reading?: unknown;
      rule?: unknown;
      channels?: unknown;
    };

    const validChannels = Array.isArray(channels)
      ? channels.filter(
          (channel): channel is NotificationChannelType =>
            typeof channel === 'string' && Object.values(NotificationChannelType).includes(channel as NotificationChannelType),
        )
      : undefined;
    const resolvedChannels = validChannels && validChannels.length > 0 ? validChannels : undefined;

    if (typeof message === 'string' && message.trim()) {
      return { message: message.trim(), channels: resolvedChannels };
    }

    if (typeof rule !== 'string' || !rule.trim()) {
      return null;
    }

    const parsedRule = this.parseAlertRule(rule.trim());

    if (!parsedRule) {
      return null;
    }

    const value = reading && typeof reading === 'object' ? (reading as Record<string, unknown>)[parsedRule.field] : undefined;
    const metricLabel = typeof metric === 'string' && metric ? metric : parsedRule.metric;
    const actionText = parsedRule.action ? ` → ${parsedRule.action.key}=${parsedRule.action.value}` : '';

    return {
      message: `${metricLabel}.${parsedRule.field} = ${value ?? '?'} (rule: ${parsedRule.field} ${parsedRule.operator} ${parsedRule.threshold})${actionText}`,
      channels: resolvedChannels,
    };
  }

  /**
   * Parses a `"<metric>.<field><op><threshold>[:<key>=<value>|none]"` rule expression, e.g.
   * `"sensor.apms>10:relay2=ON"` — the condition that fired (`sensor.apms > 10`) and, after the
   * optional `:`, the resulting action taken (`relay2=ON`), reusing `parseChannelStateMessage`'s
   * `key=value` parsing for that part. The action may also be the literal keyword `none` (e.g.
   * `"telemetry.motorCurrent>0.4:none"`), for a rule that exists purely to raise a warning
   * notification with no actuator command attached — `action` comes back `undefined` either way,
   * since `handleDeviceAlert` sends the notification regardless of whether an action is present;
   * `none` just makes that intent explicit instead of relying on `key=value` parsing to fail.
   */
  private parseAlertRule(
    rule: string,
  ): { metric: string; field: string; operator: string; threshold: number; action?: { key: string; value: string } } | null {
    const separatorIndex = rule.indexOf(':');
    const condition = separatorIndex === -1 ? rule : rule.slice(0, separatorIndex);
    const actionText = separatorIndex === -1 ? undefined : rule.slice(separatorIndex + 1).trim();

    const match = /^([^.]+)\.([^<>=!]+?)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/.exec(condition.trim());

    if (!match) {
      return null;
    }

    // Non-null: none of this regex's capture groups are optional, so a match guarantees all four.
    const metric = match[1] as string;
    const field = match[2] as string;
    const operator = match[3] as string;
    const threshold = Number(match[4]);

    if (Number.isNaN(threshold)) {
      return null;
    }

    const hasAction = actionText && actionText.toLowerCase() !== 'none';

    return { metric, field, operator, threshold, action: hasAction ? (this.parseChannelStateMessage(actionText) ?? undefined) : undefined };
  }
}
