import { NumberFieldOptional, StringField, StringFieldOptional } from '../../../decorators/field.decorators.ts';

export class TelemetryFieldDto {
  @StringField()
  key!: string;

  @StringField()
  label!: string;

  @StringFieldOptional()
  unit?: string;

  /** Lower bound of the "normal" range — see `DeviceWarningListener`, which reads these off the device's template. */
  @NumberFieldOptional()
  warningMin?: number;

  /** Upper bound of the "normal" range — see `DeviceWarningListener`, which reads these off the device's template. */
  @NumberFieldOptional()
  warningMax?: number;
}
