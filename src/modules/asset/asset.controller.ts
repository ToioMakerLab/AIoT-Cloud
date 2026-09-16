import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { resolveAccessScope } from '../../common/access-scope.util.ts';
import { PageDto } from '../../common/dto/page.dto.ts';
import type { ResponseCore } from '../../common/dto/response-core.dto.ts';
import { RoleType } from '../../constants/role-type.ts';
import { ApiPageResponse } from '../../decorators/api-page-response.decorator.ts';
import { AuthUser } from '../../decorators/auth-user.decorator.ts';
import { Auth } from '../../decorators/http.decorators.ts';
import type { UserEntity } from '../user/user.entity.ts';
import { AssetService } from './asset.service.ts';
import { AssetHealthService } from './asset-health.service.ts';
import type { AssetDto } from './dtos/asset.dto.ts';
import type { AssetHealthAssessmentDto } from './dtos/asset-health.dto.ts';
import { AssetsPageOptionsDto } from './dtos/assets-page-options.dto.ts';
import { AttachAssetNodeDto } from './dtos/attach-asset-node.dto.ts';
import { CreateAssetDto } from './dtos/create-asset.dto.ts';
import { UpdateAssetDto } from './dtos/update-asset.dto.ts';
import { UpdateAssetNodeDto } from './dtos/update-asset-node.dto.ts';

@Controller('assets')
@ApiTags('assets')
export class AssetController {
  constructor(
    private assetService: AssetService,
    private assetHealthService: AssetHealthService,
  ) {}

  @Get()
  @Auth([RoleType.GUEST, RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  @ApiPageResponse({ description: 'Get my assets list', type: PageDto })
  getAssets(
    @AuthUser() user: UserEntity,
    @Query(new ValidationPipe({ transform: true }))
    pageOptionsDto: AssetsPageOptionsDto,
  ): Promise<PageDto<AssetDto>> {
    return this.assetService.getAssets(resolveAccessScope(user), pageOptionsDto);
  }

  @Post()
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.CREATED)
  createAsset(@AuthUser() user: UserEntity, @Body() dto: CreateAssetDto): Promise<ResponseCore<AssetDto>> {
    return this.assetService.createAsset(user.id as string, user.factoryId, dto);
  }

  @Get(':id')
  @Auth([RoleType.GUEST, RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  getAsset(@AuthUser() user: UserEntity, @Param('id') id: string): Promise<ResponseCore<AssetDto>> {
    return this.assetService.getAsset(resolveAccessScope(user), id);
  }

  @Patch(':id')
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  updateAsset(@AuthUser() user: UserEntity, @Param('id') id: string, @Body() dto: UpdateAssetDto): Promise<ResponseCore<AssetDto>> {
    return this.assetService.updateAsset(user.id as string, id, dto);
  }

  @Delete(':id')
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  deleteAsset(@AuthUser() user: UserEntity, @Param('id') id: string): Promise<ResponseCore<null>> {
    return this.assetService.deleteAsset(user.id as string, id);
  }

  @Get(':id/health')
  @Auth([RoleType.GUEST, RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  getAssetHealth(@AuthUser() user: UserEntity, @Param('id') id: string): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    return this.assetHealthService.getAssessment(resolveAccessScope(user), id);
  }

  @Post(':id/nodes')
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  attachNode(
    @AuthUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: AttachAssetNodeDto,
  ): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    return this.assetService.attachNode(user.id as string, id, dto.deviceId, dto.healthWeight);
  }

  @Patch(':id/nodes/:deviceId')
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  updateNodeWeight(
    @AuthUser() user: UserEntity,
    @Param('id') id: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateAssetNodeDto,
  ): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    return this.assetService.updateNodeWeight(user.id as string, id, deviceId, dto.healthWeight);
  }

  @Delete(':id/nodes/:deviceId')
  @Auth([RoleType.USER, RoleType.ADMIN, RoleType.ROOT])
  @HttpCode(HttpStatus.OK)
  detachNode(
    @AuthUser() user: UserEntity,
    @Param('id') id: string,
    @Param('deviceId') deviceId: string,
  ): Promise<ResponseCore<AssetHealthAssessmentDto>> {
    return this.assetService.detachNode(user.id as string, id, deviceId);
  }
}
