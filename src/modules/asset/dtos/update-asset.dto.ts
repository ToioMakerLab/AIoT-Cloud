import { AssetType } from '../../../constants/asset-type.ts';
import {
  BooleanFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators.ts';

export class UpdateAssetDto {
  @StringFieldOptional()
  name?: string;

  @EnumFieldOptional(() => AssetType)
  type?: AssetType;

  @StringFieldOptional({ nullable: true })
  description?: string | null;

  @DateFieldOptional({ nullable: true })
  installedAt?: Date | null;

  @NumberFieldOptional({ nullable: true, int: true, isPositive: true })
  expectedLifespanMonths?: number | null;

  @BooleanFieldOptional()
  isActive?: boolean;
}
