import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from './api';
import type { IAssetsQuery, IAttachAssetNode, ICreateAsset, IUpdateAsset, IUpdateAssetNode } from './types';

export const ASSETS_QUERY_KEY = 'assets';
export const ASSET_HEALTH_QUERY_KEY = 'asset-health';

export const useAssetsQuery = (params?: IAssetsQuery) =>
  useQuery({
    queryKey: [ASSETS_QUERY_KEY, params],
    queryFn: () => assetsApi.getAssets(params),
  });

export const useAssetQuery = (id: string) =>
  useQuery({
    queryKey: [ASSETS_QUERY_KEY, id],
    queryFn: () => assetsApi.getAssetById(id),
    enabled: !!id,
  });

export const useAssetHealthQuery = (id: string) =>
  useQuery({
    queryKey: [ASSET_HEALTH_QUERY_KEY, id],
    queryFn: () => assetsApi.getAssetHealth(id),
    enabled: !!id,
  });

export const useCreateAssetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ICreateAsset) => assetsApi.createAsset(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
  });
};

export const useUpdateAssetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IUpdateAsset }) => assetsApi.updateAsset(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
  });
};

export const useDeleteAssetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
  });
};

export const useAttachAssetNodeMutation = (assetId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IAttachAssetNode) => assetsApi.attachNode(assetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ASSET_HEALTH_QUERY_KEY, assetId] });
      queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] });
    },
  });
};

export const useUpdateAssetNodeWeightMutation = (assetId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, data }: { deviceId: string; data: IUpdateAssetNode }) => assetsApi.updateNodeWeight(assetId, deviceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ASSET_HEALTH_QUERY_KEY, assetId] });
      queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] });
    },
  });
};

export const useDetachAssetNodeMutation = (assetId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => assetsApi.detachNode(assetId, deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ASSET_HEALTH_QUERY_KEY, assetId] });
      queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] });
    },
  });
};
