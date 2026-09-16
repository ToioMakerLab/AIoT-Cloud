import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceTemplateEntity } from '../device-template/device-template.entity.ts';
import { DeviceTemplateModule } from '../device-template/device-template.module.ts';
import { KafkaModule } from '../kafka/kafka.module.ts';
import { MqttModule } from '../mqtt/mqtt.module.ts';
import { DeviceController } from './device.controller.ts';
import { DeviceEntity } from './device.entity.ts';
import { DeviceService } from './device.service.ts';
import { DeviceLifecycleController } from './device-lifecycle.controller.ts';
import { DeviceLifecycleScheduler } from './device-lifecycle.scheduler.ts';
import { DeviceLifecycleService } from './device-lifecycle.service.ts';
import { DeviceOtaController } from './device-ota.controller.ts';
import { DeviceOtaService } from './device-ota.service.ts';
import { DeviceOtaUpdateEntity } from './device-ota-update.entity.ts';
import { DeviceProvisioningController } from './device-provisioning.controller.ts';
import { DeviceSecretController } from './device-secret.controller.ts';
import { DeviceSecretEntity } from './device-secret.entity.ts';
import { DeviceSecretService } from './device-secret.service.ts';
import { DeviceStatusScheduler } from './device-status.scheduler.ts';
import { DeviceTelemetryEntity } from './device-telemetry.entity.ts';
import { DeviceSecretGuard } from './guards/device-secret.guard.ts';
import { UnclaimedDeviceEntity } from './unclaimed-device.entity.ts';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      DeviceTemplateEntity,
      DeviceTelemetryEntity,
      DeviceSecretEntity,
      UnclaimedDeviceEntity,
      DeviceOtaUpdateEntity,
    ]),
    // KafkaProducerService (a raw kafkajs producer) lives in KafkaModule, imported here so
    // DeviceService can inject it. KafkaModule also owns the inbound Kafka consumer and needs
    // DeviceService back, so forwardRef() on both sides breaks the resulting circular import.
    forwardRef(() => KafkaModule),
    // Same circular-import shape as KafkaModule above: MqttProducerService lives in MqttModule,
    // and MqttModule's own MqttController needs DeviceService back.
    forwardRef(() => MqttModule),
    // For FirmwareService — DeviceOtaService reads the firmware catalog it owns. No cycle here:
    // DeviceTemplateModule only depends on DeviceEntity (via forFeature), never this module.
    DeviceTemplateModule,
  ],
  controllers: [DeviceController, DeviceProvisioningController, DeviceSecretController, DeviceLifecycleController, DeviceOtaController],
  exports: [DeviceService, DeviceOtaService, DeviceLifecycleService],
  providers: [
    DeviceService,
    DeviceSecretService,
    DeviceSecretGuard,
    DeviceStatusScheduler,
    DeviceLifecycleService,
    DeviceLifecycleScheduler,
    DeviceOtaService,
  ],
})
export class DeviceModule {}
