import { AssetType } from '../../../constants/asset-type.ts';
import { DateFieldOptional, EnumFieldOptional, NumberFieldOptional, StringField, StringFieldOptional } from '../../../decorators/field.decorators.ts';

export class CreateAssetDto {
  @StringField()
  name!: string;

  @EnumFieldOptional(() => AssetType)
  type?: AssetType;

  @StringFieldOptional({ nullable: true })
  description?: string | null;

  @DateFieldOptional({ nullable: true })
  installedAt?: Date | null;

  @NumberFieldOptional({ nullable: true, int: true, isPositive: true })
  expectedLifespanMonths?: number | null;
}
