import apiClient from '@/lib/api-client';
import type {
  IAsset,
  IAssetHealthAssessment,
  IAssetsQuery,
  IAttachAssetNode,
  ICreateAsset,
  IPageDto,
  IResponseCore,
  IUpdateAsset,
  IUpdateAssetNode,
} from './types';
import { SUCCESS_CODE } from './types';

// Unwraps a ResponseCore envelope, throwing so react-query treats a
// business-logic failure (HTTP 200 + non-zero `error`) the same as a
// rejected request. Callers surface `error.message` to the user.
function unwrap<T>(envelope: IResponseCore<T>): T {
  if (envelope.error !== SUCCESS_CODE) {
    throw new Error(envelope.message || 'Something went wrong!');
  }
  return envelope.data as T;
}

export const assetsApi = {
  getAssets: async (params?: IAssetsQuery) => {
    const response = await apiClient.get<IPageDto<IAsset>>('/assets', { params });
    return response.data;
  },
  getAssetById: async (id: string) => {
    const response = await apiClient.get<IResponseCore<IAsset>>(`/assets/${id}`);
    return unwrap(response.data);
  },
  createAsset: async (data: ICreateAsset) => {
    const response = await apiClient.post<IResponseCore<IAsset>>('/assets', data);
    return unwrap(response.data);
  },
  updateAsset: async (id: string, data: IUpdateAsset) => {
    const response = await apiClient.patch<IResponseCore<IAsset>>(`/assets/${id}`, data);
    return unwrap(response.data);
  },
  deleteAsset: async (id: string) => {
    const response = await apiClient.delete<IResponseCore<null>>(`/assets/${id}`);
    return unwrap(response.data);
  },
  getAssetHealth: async (id: string) => {
    const response = await apiClient.get<IResponseCore<IAssetHealthAssessment>>(`/assets/${id}/health`);
    return unwrap(response.data);
  },
  attachNode: async (id: string, data: IAttachAssetNode) => {
    const response = await apiClient.post<IResponseCore<IAssetHealthAssessment>>(`/assets/${id}/nodes`, data);
    return unwrap(response.data);
  },
  updateNodeWeight: async (id: string, deviceId: string, data: IUpdateAssetNode) => {
    const response = await apiClient.patch<IResponseCore<IAssetHealthAssessment>>(`/assets/${id}/nodes/${deviceId}`, data);
    return unwrap(response.data);
  },
  detachNode: async (id: string, deviceId: string) => {
    const response = await apiClient.delete<IResponseCore<IAssetHealthAssessment>>(`/assets/${id}/nodes/${deviceId}`);
    return unwrap(response.data);
  },
};
