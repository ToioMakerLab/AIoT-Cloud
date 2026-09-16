import { NumberFieldOptional, StringField } from '../../../decorators/field.decorators.ts';

export class AttachAssetNodeDto {
  @StringField()
  deviceId!: string;

  /** This node's importance to the asset's composite health index; defaults to 1 when unset. 0 excludes it. */
  @NumberFieldOptional({ min: 0 })
  healthWeight?: number;
}
