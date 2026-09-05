import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends the GATEWAY template's telemetry schema (see SeedGatewayTemplate) with two hardware
 * health fields `aiot-gate` also reports alongside its existing `cpuLoadPercent`/
 * `memoryUsagePercent`: `cpuTemperatureCelsius` (SoC thermal reading) and `diskUsagePercent`
 * (root filesystem usage, relevant since the gateway persists OTA payloads/logs locally). Same
 * plain-UPDATE approach as UpdateSensorNodeTelemetrySchema — the template row already exists in
 * every environment, so there's no fresh-install case to guard against.
 */
export class AddGatewayHardwareTelemetryFields1789600000000 implements MigrationInterface {
  name = 'AddGatewayHardwareTelemetryFields1789600000000';

  private readonly telemetrySchema = [
    { key: 'uptimeSeconds', label: 'Uptime', unit: 's' },
    { key: 'bridgedDeviceCount', label: 'Bridged Devices', unit: 'count' },
    { key: 'cpuLoadPercent', label: 'CPU Load', unit: '%', warningMin: 0, warningMax: 90 },
    { key: 'cpuTemperatureCelsius', label: 'CPU Temperature', unit: '°C', warningMin: 0, warningMax: 80 },
    { key: 'memoryUsagePercent', label: 'Memory Usage', unit: '%', warningMin: 0, warningMax: 90 },
    { key: 'diskUsagePercent', label: 'Disk Usage', unit: '%', warningMin: 0, warningMax: 90 },
    { key: 'kafkaConnected', label: 'Kafka Connection', unit: 'state' },
  ];

  private readonly previousTelemetrySchema = [
    { key: 'uptimeSeconds', label: 'Uptime', unit: 's' },
    { key: 'bridgedDeviceCount', label: 'Bridged Devices', unit: 'count' },
    { key: 'cpuLoadPercent', label: 'CPU Load', unit: '%', warningMin: 0, warningMax: 90 },
    { key: 'memoryUsagePercent', label: 'Memory Usage', unit: '%', warningMin: 0, warningMax: 90 },
    { key: 'kafkaConnected', label: 'Kafka Connection', unit: 'state' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "device_templates" SET "telemetry_schema" = $1 WHERE "type" = 'GATEWAY'`, [
      JSON.stringify(this.telemetrySchema),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "device_templates" SET "telemetry_schema" = $1 WHERE "type" = 'GATEWAY'`, [
      JSON.stringify(this.previousTelemetrySchema),
    ]);
  }
}
