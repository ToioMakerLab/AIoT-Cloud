import { NumberField } from '../../../decorators/field.decorators.ts';

export class UpdateAssetNodeDto {
  /** This node's importance to the asset's composite health index. 0 excludes it. */
  @NumberField({ min: 0 })
  healthWeight!: number;
}
