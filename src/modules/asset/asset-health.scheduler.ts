import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AssetHealthService } from './asset-health.service.ts';

/**
 * Keeps every asset's persisted health index/status fresh so list views can show it without recomputing
 * on read. Runs at 03:15 daily, offset from `DeviceLifecycleScheduler`'s 03:00 run so the per-node
 * telemetry breach counts it reads from are settled first.
 */
@Injectable()
export class AssetHealthScheduler {
  private readonly logger = new Logger(AssetHealthScheduler.name);

  constructor(private readonly assetHealthService: AssetHealthService) {}

  @Cron('15 3 * * *')
  async assessAllAssets(): Promise<void> {
    try {
      await this.assetHealthService.assessAllAssets();
    } catch (error) {
      this.logger.error(`Failed to run scheduled asset health assessment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
