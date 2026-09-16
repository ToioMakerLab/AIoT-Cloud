import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity } from '../device/device.entity.ts';
import { DeviceModule } from '../device/device.module.ts';
import { AssetController } from './asset.controller.ts';
import { AssetEntity } from './asset.entity.ts';
import { AssetService } from './asset.service.ts';
import { AssetHealthScheduler } from './asset-health.scheduler.ts';
import { AssetHealthService } from './asset-health.service.ts';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetEntity, DeviceEntity]),
    // For the exported DeviceLifecycleService — AssetHealthService reuses its per-node telemetry
    // breach-counting instead of duplicating that logic.
    DeviceModule,
  ],
  controllers: [AssetController],
  exports: [AssetService, AssetHealthService],
  providers: [AssetService, AssetHealthService, AssetHealthScheduler],
})
export class AssetModule {}
