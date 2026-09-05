import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import parse from 'parse-duration';
import type { Level } from 'pino';
import { InitSchema1787210034577 } from '../../database/migrations/1787210034577-InitSchema.ts';
import { AddIotDeviceManagement1787378213385 } from '../../database/migrations/1787378213385-AddIotDeviceManagement.ts';
import { AddEmailVerification1787381039053 } from '../../database/migrations/1787381039053-AddEmailVerification.ts';
import { AddDeviceProvisioningConfig1787400000000 } from '../../database/migrations/1787400000000-AddDeviceProvisioningConfig.ts';
import { AddDeviceTemplateActionSchema1787500000000 } from '../../database/migrations/1787500000000-AddDeviceTemplateActionSchema.ts';
import { AddDeviceIsActive1787600000000 } from '../../database/migrations/1787600000000-AddDeviceIsActive.ts';
import { AddNotificationConfig1787700000000 } from '../../database/migrations/1787700000000-AddNotificationConfig.ts';
import { RemoveDevicePerDeviceSecret1787800000000 } from '../../database/migrations/1787800000000-RemoveDevicePerDeviceSecret.ts';
import { AddDeviceSecrets1787900000000 } from '../../database/migrations/1787900000000-AddDeviceSecrets.ts';
import { AddDeviceStatus1788000000000 } from '../../database/migrations/1788000000000-AddDeviceStatus.ts';
import { RemoveEnumUser1788066551348 } from '../../database/migrations/1788066551348-RemoveEnumUser.ts';
import { SeedRelay2ChAcs712Template1788100000000 } from '../../database/migrations/1788100000000-SeedRelay2ChAcs712Template.ts';
import { AddRelayCurrentNodeTemplateType1788200000000 } from '../../database/migrations/1788200000000-AddRelayCurrentNodeTemplateType.ts';
import { AddUnclaimedDevices1788300000000 } from '../../database/migrations/1788300000000-AddUnclaimedDevices.ts';
import { SeedGatewayTemplate1788400000000 } from '../../database/migrations/1788400000000-SeedGatewayTemplate.ts';
import { AddUserIsActive1788500000000 } from '../../database/migrations/1788500000000-AddUserIsActive.ts';
import { AddWebPushNotificationChannel1788600000000 } from '../../database/migrations/1788600000000-AddWebPushNotificationChannel.ts';
import { AddDeviceChannelStates1788700000000 } from '../../database/migrations/1788700000000-AddDeviceChannelStates.ts';
import { AddDeviceOfflineAlert1788800000000 } from '../../database/migrations/1788800000000-AddDeviceOfflineAlert.ts';
import { AddDeviceAlertRulesAndFailsafe1788900000000 } from '../../database/migrations/1788900000000-AddDeviceAlertRulesAndFailsafe.ts';
import { CreateFactoriesTable1789000000000 } from '../../database/migrations/1789000000000-CreateFactoriesTable.ts';
import { UpdateSensorNodeTelemetrySchema1789100000000 } from '../../database/migrations/1789100000000-UpdateSensorNodeTelemetrySchema.ts';
import { AddNotificationMessages1789200000000 } from '../../database/migrations/1789200000000-AddNotificationMessages.ts';
import { AddDeviceLifecycle1789300000000 } from '../../database/migrations/1789300000000-AddDeviceLifecycle.ts';
import { AddDeviceOta1789400000000 } from '../../database/migrations/1789400000000-AddDeviceOta.ts';
import { AddUnclaimedDeviceIgnoredAt1789500000000 } from '../../database/migrations/1789500000000-AddUnclaimedDeviceIgnoredAt.ts';
import { UserSubscriber } from '../../entity-subscribers/user-subscriber.ts';
import { DashboardEntity } from '../../modules/dashboard/dashboard.entity.ts';
import { DeviceEntity } from '../../modules/device/device.entity.ts';
import { DeviceOtaUpdateEntity } from '../../modules/device/device-ota-update.entity.ts';
import { DeviceSecretEntity } from '../../modules/device/device-secret.entity.ts';
import { DeviceTelemetryEntity } from '../../modules/device/device-telemetry.entity.ts';
import { UnclaimedDeviceEntity } from '../../modules/device/unclaimed-device.entity.ts';
import { DeviceTemplateEntity } from '../../modules/device-template/device-template.entity.ts';
import { FirmwareEntity } from '../../modules/device-template/firmware.entity.ts';
import { FactoryEntity } from '../../modules/factory/factory.entity.ts';
import { NotificationConfigEntity } from '../../modules/notification/notification-config.entity.ts';
import { NotificationMessageEntity } from '../../modules/notification/notification-message.entity.ts';
import { UserEntity } from '../../modules/user/user.entity.ts';
import { UserSettingsEntity } from '../../modules/user/user-settings.entity.ts';
import { SnakeNamingStrategy } from '../../snake-naming.strategy.ts';
import { AddGatewayHardwareTelemetryFields1789600000000 } from '../../database/migrations/1789600000000-AddGatewayHardwareTelemetryFields.ts';

@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  private getNumber(key: string): number {
    const value = this.get(key);

    try {
      return Number(value);
    } catch {
      throw new Error(`${key} environment variable is not a number`);
    }
  }

  private getDuration(key: string, format?: Parameters<typeof parse>[1]): number {
    const value = this.getString(key);
    const duration = parse(value, format);

    if (duration === null) {
      throw new Error(`${key} environment variable is not a valid duration`);
    }

    return duration;
  }

  private getBoolean(key: string): boolean {
    const value = this.get(key);

    try {
      return Boolean(JSON.parse(value));
    } catch {
      throw new Error(`${key} env var is not a boolean`);
    }
  }

  private getString(key: string): string {
    const value = this.get(key);

    return value.replaceAll(String.raw`\n`, '\n');
  }

  get nodeEnv(): string {
    return this.getString('NODE_ENV');
  }

  get fallbackLanguage(): string {
    return this.getString('FALLBACK_LANGUAGE');
  }

  get throttlerConfigs(): ThrottlerOptions {
    return {
      ttl: this.getDuration('THROTTLER_TTL', 'second'),
      limit: this.getNumber('THROTTLER_LIMIT'),
      // storage: new ThrottlerStorageRedisService(new Redis(this.redis)),
    };
  }

  get postgresConfig(): TypeOrmModuleOptions {
    return {
      entities: [
        UserEntity,
        UserSettingsEntity,
        DeviceTemplateEntity,
        DeviceEntity,
        DeviceSecretEntity,
        DeviceTelemetryEntity,
        UnclaimedDeviceEntity,
        DashboardEntity,
        NotificationConfigEntity,
        FactoryEntity,
        NotificationMessageEntity,
        FirmwareEntity,
        DeviceOtaUpdateEntity,
      ],
      migrations: [
        InitSchema1787210034577,
        AddIotDeviceManagement1787378213385,
        AddEmailVerification1787381039053,
        AddDeviceProvisioningConfig1787400000000,
        AddDeviceTemplateActionSchema1787500000000,
        AddDeviceIsActive1787600000000,
        AddNotificationConfig1787700000000,
        RemoveDevicePerDeviceSecret1787800000000,
        AddDeviceSecrets1787900000000,
        AddDeviceStatus1788000000000,
        SeedRelay2ChAcs712Template1788100000000,
        AddRelayCurrentNodeTemplateType1788200000000,
        AddUnclaimedDevices1788300000000,
        SeedGatewayTemplate1788400000000,
        AddUserIsActive1788500000000,
        AddWebPushNotificationChannel1788600000000,
        AddDeviceChannelStates1788700000000,
        RemoveEnumUser1788066551348,
        AddDeviceOfflineAlert1788800000000,
        AddDeviceAlertRulesAndFailsafe1788900000000,
        CreateFactoriesTable1789000000000,
        UpdateSensorNodeTelemetrySchema1789100000000,
        AddNotificationMessages1789200000000,
        AddDeviceLifecycle1789300000000,
        AddDeviceOta1789400000000,
        AddUnclaimedDeviceIgnoredAt1789500000000,
        AddGatewayHardwareTelemetryFields1789600000000
      ],
      dropSchema: this.isTest,
      type: 'postgres',
      host: this.getString('DB_HOST'),
      port: this.getNumber('DB_PORT'),
      username: this.getString('DB_USERNAME'),
      password: this.getString('DB_PASSWORD'),
      database: this.getString('DB_DATABASE'),
      subscribers: [UserSubscriber],
      migrationsRun: true,
      logging: this.getBoolean('ENABLE_ORM_LOGS'),
      namingStrategy: new SnakeNamingStrategy(),
    };
  }

  get awsS3Config() {
    return {
      //   bucketRegion: this.getString('AWS_S3_BUCKET_REGION'),
      //   bucketApiVersion: this.getString('AWS_S3_API_VERSION'),
      //   bucketName: this.getString('AWS_S3_BUCKET_NAME'),
      bucketRegion: '',
      bucketApiVersion: '',
      bucketName: '',
    };
  }

  get documentationEnabled(): boolean {
    return this.getBoolean('ENABLE_DOCUMENTATION');
  }

  get natsEnabled(): boolean {
    // return this.getBoolean('NATS_ENABLED');
    return false;
  }

  get natsConfig() {
    return {
      //   host: this.getString('NATS_HOST'),
      //   port: this.getNumber('NATS_PORT'),
      host: '',
      port: 0,
    };
  }

  get mqttEnabled(): boolean {
    return this.getBoolean('MQTT_ENABLED');
  }

  get mqttConfig() {
    return {
      url: this.getString('MQTT_URL'),
      username: this.configService.get<string>('MQTT_USERNAME'),
      password: this.configService.get<string>('MQTT_PASSWORD'),
    };
  }

  get kafkaEnabled(): boolean {
    return this.getBoolean('KAFKA_ENABLED');
  }

  get kafkaConfig() {
    const saslEnabled = this.configService.get<string>('KAFKA_SASL_ENABLED', 'false') === 'true';

    return {
      brokers: this.getString('KAFKA_BROKERS'),
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'aiot-lab-service',
      groupId: this.configService.get<string>('KAFKA_GROUP_ID') ?? 'aiot-lab-service-consumer',
      ssl: this.configService.get<string>('KAFKA_SSL_ENABLED', 'false') === 'true',
      sasl: saslEnabled
        ? {
            mechanism: this.configService.get<string>('KAFKA_SASL_MECHANISM') ?? 'plain',
            username: this.configService.get<string>('KAFKA_SASL_USERNAME') ?? '',
            password: this.configService.get<string>('KAFKA_SASL_PASSWORD') ?? '',
          }
        : undefined,
    };
  }

  get authConfig() {
    return {
      privateKey: this.getString('JWT_PRIVATE_KEY'),
      publicKey: this.getString('JWT_PUBLIC_KEY'),
      jwtExpirationTime: this.getNumber('JWT_EXPIRATION_TIME'),
    };
  }

  get appConfig() {
    return {
      port: this.getString('PORT'),
    };
  }

  /** This backend's own publicly-reachable base URL — used to build absolute links a device/gateway
   * downloads directly (e.g. a firmware `fileUrl`), as opposed to `mailConfig.appUrl`, which points
   * at the human-facing web client. Falls back to a local dev URL so uploads still work without
   * the env var set, just with a non-routable host outside this machine. */
  get publicUrl(): string {
    return this.getFallback('PUBLIC_API_URL', `http://localhost:${this.getString('PORT')}`);
  }

  get mailEnabled(): boolean {
    return this.getBoolean('MAIL_ENABLED');
  }

  get mailConfig() {
    return {
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      user: this.configService.get<string>('SMTP_USER'),
      pass: this.configService.get<string>('SMTP_PASS'),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      from: this.configService.get<string>('SMTP_FROM', 'no-reply@aiot-lab.local'),
      appUrl: this.configService.get<string>('APP_URL', 'http://localhost:5173'),
    };
  }

  get zaloEnabled(): boolean {
    return this.getBoolean('ZALO_ENABLED');
  }

  get zaloConfig() {
    const apiBaseUrl = this.configService.get<string>('ZALO_BOT_API_BASE_URL', 'https://bot-api.zaloplatforms.com');
    const botToken = this.configService.get<string>('ZALO_BOT_TOKEN');

    return {
      botToken,
      /** Compared against the `X-Bot-Api-Secret-Token` header on every incoming webhook call; also sent as `secret_token` to setWebhook. */
      webhookSecret: this.configService.get<string>('ZALO_BOT_WEBHOOK_SECRET'),
      sendMessageUrl: botToken ? `${apiBaseUrl}/bot${botToken}/sendMessage` : null,
      setWebhookUrl: botToken ? `${apiBaseUrl}/bot${botToken}/setWebhook` : null,
      deleteWebhookUrl: botToken ? `${apiBaseUrl}/bot${botToken}/deleteWebhook` : null,
      testWebhookUrl: botToken ? `${apiBaseUrl}/bot${botToken}/testWebhook` : null,
      /** Public HTTPS URL of our webhook endpoint, registered with Zalo via setWebhook on startup. */
      webhookUrl: this.configService.get<string>('ZALO_BOT_WEBHOOK_URL'),
      /** Where users find the bot to send it their link code, e.g. `https://zalo.me/s/<bot-share-id>`. Shown to the client as-is; no start-payload support in the Bot API. */
      shareUrl: this.configService.get<string>('ZALO_BOT_SHARE_URL'),
    };
  }

  get firebaseEnabled(): boolean {
    return this.getBoolean('FIREBASE_ENABLED');
  }

  get firebaseConfig() {
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    return {
      projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
      clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
      // Env files can't hold literal newlines, so the private key is stored with escaped `\n`s.
      privateKey: privateKey ? privateKey.replaceAll('\\n', '\n') : undefined,
    };
  }

  get loggerConfig(): {
    file: string;
    consoleLevel: Level;
    fileLevel: Level;
  } {
    // LOG_LEVEL supports a single level for all outputs ("debug")
    // or per-output levels ("console:debug,file:warn")
    const raw = this.configService.get<string>('LOG_LEVEL', 'info');
    const levels: Record<string, string> = {};

    for (const part of raw.split(',')) {
      const [target = '*', value] = part.includes(':') ? part.split(':', 2) : ['*', part];

      levels[target.trim()] = (value ?? 'info').trim();
    }

    const fallback = levels['*'] ?? 'info';

    return {
      file: this.configService.get<string>('LOG_FILE', 'logs/app.log'),
      consoleLevel: (levels.console ?? fallback) as Level,
      fileLevel: (levels.file ?? fallback) as Level,
    };
  }
  get rootPassword(): string {
    return this.getFallback('ROOT_PASSWORD', 'root-password-please-change');
  }

  private get(key: string): string {
    const value = this.configService.get<string>(key);

    if (value == null) {
      throw new Error(`${key} environment variable does not set`); // probably we should call process.exit() too to avoid locking the service
    }

    return value;
  }

  private getFallback(key: string, fallback: string): string {
    const value = this.configService.get<string>(key);

    if (value == null) {
      return fallback;
    }

    return value;
  }
}
