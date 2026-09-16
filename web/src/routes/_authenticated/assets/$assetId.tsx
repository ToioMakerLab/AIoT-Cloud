import { createFileRoute } from '@tanstack/react-router';
import AssetDetail from '@/features/assets/asset-detail';

export const Route = createFileRoute('/_authenticated/assets/$assetId')({
  component: AssetDetail,
});
