import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type { AccessScope } from '../../common/access-scope.util.ts';
import type { PageDto } from '../../common/dto/page.dto.ts';
import { ResponseCore } from '../../common/dto/response-core.dto.ts';
import { ErrorCode } from '../../constants/error-code.ts';
import { DeviceEntity } from '../device/device.entity.ts';
import { AssetEntity } from './asset.entity.ts';
import { AssetHealthService } from './asset-health.service.ts';
import type { AssetDto } from './dtos/asset.dto.ts';
import type { AssetHealthAssessmentDto } from './dtos/asset-health.dto.ts';
import type { AssetsPageOptionsDto } from './dtos/assets-page-options.dto.ts';
import type { CreateAssetDto } from './dtos/create-asset.dto.ts';
import type { UpdateAssetDto } from './dtos/update-asset.dto.ts';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    @InjectRepository(AssetEntity)
    private assetRepository: Repository<AssetEntity>,
    @InjectRepository(DeviceEntity)
    private deviceRepository: Repository<DeviceEntity>,
    private assetHealthService: AssetHealthService,
  ) {}

  /** `scope: null` means unrestricted (GUEST) — every asset system-wide. */
  async getAssets(scope: AccessScope, pageOptionsDto: AssetsPageOptionsDto): Promise<PageDto<AssetDto>> {
    try {
      const queryBuilder = this.assetRepository.createQueryBuilder('asset').orderBy('asset.createdAt', pageOptionsDto.order);

      if (scope && 'factoryId' in scope) {
        queryBuilder.where('asset.factoryId = :factoryId', { factoryId: scope.factoryId });
      } else if (scope) {
        queryBuilder.where('asset.userId = :userId', { userId: scope.userId });
      }

      const [items, pageMetaDto] = await queryBuilder.paginate(pageOptionsDto);

      return items.toPageDto(pageMetaDto);
    } catch (error) {
      this.logger.error('Error occurred while fetching assets', error);
      throw error;
    }
  }

  async getAsset(scope: AccessScope, id: string): Promise<ResponseCore<AssetDto>> {
    const entity = await this.assetRepository.findOne({ where: scope ? { id, ...scope } : { id } });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    return ResponseCore.ok(entity.toDto());
  }

  @Transactional()
  async createAsset(userId: string, factoryId: string | null, dto: CreateAssetDto): Promise<ResponseCore<AssetDto>> {
    const entity = this.assetRepository.create({ ...dto, userId, factoryId });
    await this.assetRepository.save(entity);

    return ResponseCore.ok(entity.toDto());
  }

  @Transactional()
  async updateAsset(userId: string, id: string, dto: UpdateAssetDto): Promise<ResponseCore<AssetDto>> {
    const entity = await this.assetRepository.findOneBy({ id, userId });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    Object.assign(entity, dto);
    await this.assetRepository.save(entity);

    return ResponseCore.ok(entity.toDto());
  }

  @Transactional()
  async deleteAsset(userId: string, id: string): Promise<ResponseCore<null>> {
    const entity = await this.assetRepository.findOneBy({ id, userId });

    if (!entity) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    // FK is ON DELETE SET NULL, so attached nodes just detach automatically.
    await this.assetRepository.remove(entity);

    return ResponseCore.ok(null);
  }

  @Transactional()
  async attachNode(userId: string, assetId: string, deviceId: string, healthWeight?: number): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    const asset = await this.assetRepository.findOneBy({ id: assetId, userId });

    if (!asset) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    const device = await this.deviceRepository.findOneBy({ id: deviceId, userId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    device.assetId = asset.id;

    if (healthWeight !== undefined) {
      device.healthWeight = healthWeight;
    }

    await this.deviceRepository.save(device);

    return ResponseCore.ok(await this.assetHealthService.assessAsset(asset));
  }

  @Transactional()
  async updateNodeWeight(userId: string, assetId: string, deviceId: string, healthWeight: number): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    const asset = await this.assetRepository.findOneBy({ id: assetId, userId });

    if (!asset) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    const device = await this.deviceRepository.findOneBy({ id: deviceId, userId, assetId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    device.healthWeight = healthWeight;
    await this.deviceRepository.save(device);

    return ResponseCore.ok(await this.assetHealthService.assessAsset(asset));
  }

  @Transactional()
  async detachNode(userId: string, assetId: string, deviceId: string): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    const asset = await this.assetRepository.findOneBy({ id: assetId, userId });

    if (!asset) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.assetNotFound');
    }

    const device = await this.deviceRepository.findOneBy({ id: deviceId, userId, assetId });

    if (!device) {
      return ResponseCore.fail(ErrorCode.NOT_FOUND, 'error.deviceNotFound');
    }

    device.assetId = null;
    await this.deviceRepository.save(device);

    return ResponseCore.ok(await this.assetHealthService.assessAsset(asset));
  }
}
