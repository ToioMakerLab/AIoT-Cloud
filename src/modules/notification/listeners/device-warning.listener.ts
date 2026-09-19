import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DeviceStatus } from '../../../constants/device-status.ts';
import type { NotificationChannelType } from '../../../constants/notification-channel-type.ts';
import type { DeviceAlertEvent, DeviceStatusEvent, DeviceTelemetryEvent } from '../../device/device.service.ts';
import { DeviceService } from '../../device/device.service.ts';
import type { DeviceWarningThreshold } from '../../device/interfaces/device-network-config.interface.ts';
import type { TelemetryFieldDefinition } from '../../device-template/device-template.entity.ts';
import { NotificationService } from '../notification.service.ts';

@Injectable()
export class DeviceWarningListener {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly notificationService: NotificationService,
  ) {}

  // Gateways (and any other device with no telemetrySchema of their own) have nothing for
  // handleTelemetry below to threshold on, so this is their equivalent alert rule — see
  // DeviceEntity.offlineAlert. `sweepOfflineDevices`/`handleDeviceStatusMessage` only emit this
  // event on an actual ONLINE -> OFFLINE transition, so this fires once per outage, not per sweep tick.
  @OnEvent('device.status')
  async handleStatusChange(event: DeviceStatusEvent): Promise<void> {
    if (event.status !== DeviceStatus.OFFLINE) {
      return;
    }

    const device = await this.deviceService.findByDeviceIdWithTemplate(event.deviceId);

    if (!device?.offlineAlert?.enabled) {
      return;
    }

    const message = `[Cảnh báo] ${device.name} đã ngoại tuyến`;

    await this.notificationService.sendWarning(device.userId, message, device.offlineAlert.channels ?? undefined, device.id);
  }

  // The device/gateway itself already decided this is alert-worthy (`devices.cloud.alert` —
  // DeviceService.handleDeviceAlert), so unlike handleTelemetry below, there's no threshold to
  // check here — just forward the (already-rendered) message to the owner's channels.
  @OnEvent('device.alert')
  async handleAlert(event: DeviceAlertEvent): Promise<void> {
    const device = await this.deviceService.findByDeviceIdWithTemplate(event.deviceId);

    if (!device) {
      return;
    }

    await this.notificationService.sendWarning(device.userId, event.message, event.channels, device.id);
  }

  @OnEvent('device.telemetry')
  async handleTelemetry(event: DeviceTelemetryEvent): Promise<void> {
    const device = await this.deviceService.findByDeviceIdWithTemplate(event.deviceId);

    if (!device?.template?.telemetrySchema) {
      return;
    }

    for (const field of device.template.telemetrySchema) {
      const value = event.payload[field.key];

      if (typeof value !== 'number') {
        continue;
      }

      const breach = this.checkThreshold(field, value, device.warningOverrides?.[field.key]);

      if (!breach) {
        continue;
      }

      const message = this.buildMessage(device.name, field, value, breach);

      // eslint-disable-next-line no-await-in-loop
      await this.notificationService.sendWarning(device.userId, message, breach.channels, device.id);
    }
  }

  private checkThreshold(
    field: TelemetryFieldDefinition,
    value: number,
    override: DeviceWarningThreshold | undefined,
  ): { min?: number; max?: number; channels?: NotificationChannelType[] } | null {
    if (override?.enabled === false) {
      return null;
    }

    const min = override?.min ?? field.warningMin;
    const max = override?.max ?? field.warningMax;

    if (min === undefined && max === undefined) {
      return null;
    }

    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      return { min, max, channels: override?.channels };
    }

    return null;
  }

  private buildMessage(deviceName: string, field: TelemetryFieldDefinition, value: number, breach: { min?: number; max?: number }): string {
    const range = [breach.min !== undefined ? `tối thiểu ${breach.min}` : null, breach.max !== undefined ? `tối đa ${breach.max}` : null]
      .filter(Boolean)
      .join(', ');

    return `[Cảnh báo] ${deviceName}: ${field.label} = ${value}${field.unit ?? ''} (kỳ vọng ${range})`;
  }
}
