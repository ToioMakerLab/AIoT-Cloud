export const DEVICE_TEMPLATE_TYPES = ['SENSOR_NODE', 'RELAY_NODE', 'RELAY_CURRENT_NODE', 'GATEWAY', 'OTHER'] as const;

export type DeviceTemplateTypeValue = (typeof DEVICE_TEMPLATE_TYPES)[number];

export interface ITelemetryFieldDefinition {
  key: string;
  label: string;
  unit?: string;
  warningMin?: number;
  warningMax?: number;
}

export const DEVICE_ACTION_TYPES = ['TOGGLE', 'BUTTON'] as const;
export type DeviceActionTypeValue = (typeof DEVICE_ACTION_TYPES)[number];

export interface IDeviceActionFieldDefinition {
  key: string;
  label: string;
  type: DeviceActionTypeValue;
  onValue?: string | null;
  offValue?: string | null;
}

export interface IDeviceTemplate {
  id: string;
  name: string;
  type: DeviceTemplateTypeValue;
  description?: string | null;
  manufacturer?: string | null;
  telemetrySchema?: ITelemetryFieldDefinition[] | null;
  actionSchema?: IDeviceActionFieldDefinition[] | null;
  icon?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateDeviceTemplate {
  name: string;
  type: DeviceTemplateTypeValue;
  description?: string;
  manufacturer?: string;
  telemetrySchema?: ITelemetryFieldDefinition[];
  actionSchema?: IDeviceActionFieldDefinition[];
  icon?: string;
  isActive?: boolean;
}

export type IUpdateDeviceTemplate = Partial<ICreateDeviceTemplate>;

// Mirrors backend src/modules/device-template/dtos/firmware.dto.ts
export interface IFirmware {
  id: string;
  templateId: string;
  version: string;
  fileUrl: string;
  checksum?: string | null;
  sizeBytes?: number | null;
  releaseNotes?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Registers a build already hosted elsewhere — see uploadFirmware for the multipart `.bin` upload variant. */
export interface ICreateFirmware {
  templateId: string;
  version: string;
  fileUrl: string;
  checksum?: string | null;
  sizeBytes?: number | null;
  releaseNotes?: string | null;
}

export interface IUpdateFirmware {
  releaseNotes?: string | null;
  isActive?: boolean;
}

export interface IDeviceTemplatesQueryParams {
  page?: number;
  take?: number;
  order?: 'ASC' | 'DESC';
  q?: string;
}

// Mirrors backend `ResponseCore<T>` (src/common/dto/response-core.dto.ts):
// { error: ErrorCode, data: T | null, message: string }. Unlike the legacy
// backend the `users` feature talks to, business failures on this API come
// back as HTTP 200 with a non-zero `error` code, so callers must check it.
export interface IResponseCore<T> {
  error: number;
  data: T | null;
  message: string;
}

export const SUCCESS_CODE = 0;

export interface IPageMeta {
  page: number;
  take: number;
  itemCount: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface IPageDto<T> {
  data: T[];
  meta: IPageMeta;
}
