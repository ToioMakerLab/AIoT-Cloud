import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { AssetHealthStatus } from '../../../constants/asset-health-status.ts';
import { AssetType } from '../../../constants/asset-type.ts';
import {
  BooleanField,
  DateFieldOptional,
  EnumField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators.ts';
import type { AssetEntity } from '../asset.entity.ts';

export class AssetDto extends AbstractDto {
  @StringField()
  name!: string;

  @EnumField(() => AssetType)
  type!: AssetType;

  @StringFieldOptional({ nullable: true })
  description?: string | null;

  @StringField()
  userId!: string;

  @StringFieldOptional({ nullable: true })
  factoryId?: string | null;

  @DateFieldOptional({ nullable: true })
  installedAt?: Date | null;

  @NumberFieldOptional({ nullable: true, int: true })
  expectedLifespanMonths?: number | null;

  @NumberFieldOptional({ nullable: true, int: true })
  healthIndex?: number | null;

  @EnumField(() => AssetHealthStatus)
  healthStatus!: AssetHealthStatus;

  @DateFieldOptional({ nullable: true })
  healthAssessedAt?: Date | null;

  @BooleanField()
  isActive!: boolean;

  constructor(entity: AssetEntity) {
    super(entity);
    this.name = entity.name;
    this.type = entity.type;
    this.description = entity.description;
    this.userId = entity.userId;
    this.factoryId = entity.factoryId;
    this.installedAt = entity.installedAt;
    this.expectedLifespanMonths = entity.expectedLifespanMonths;
    this.healthIndex = entity.healthIndex;
    this.healthStatus = entity.healthStatus;
    this.healthAssessedAt = entity.healthAssessedAt;
    this.isActive = entity.isActive;
  }
}
