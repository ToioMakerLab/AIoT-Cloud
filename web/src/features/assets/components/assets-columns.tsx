import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import LongText from '@/components/long-text';
import { Badge } from '@/components/ui/badge';
import { assetHealthStatusColors, getAssetTypeLabel } from '../data/data';
import type { Asset } from '../data/schema';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableRowActions } from './data-table-row-actions';

// A hook (not a static array) so column headers/labels can be translated — mirrors
// `useFactoriesColumns` (factories/components/factories-columns.tsx).
export function useAssetsColumns(): ColumnDef<Asset>[] {
  const { t } = useTranslation('common');
  const { t: tAssets } = useTranslation('assets');

  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('words.name')} />,
      cell: ({ row }) => (
        <Link to="/assets/$assetId" params={{ assetId: row.original.id }} className="w-fit text-nowrap font-medium hover:underline">
          <LongText className="max-w-48">{row.getValue('name')}</LongText>
        </Link>
      ),
      meta: { className: 'w-48' },
      enableHiding: false,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('words.type')} />,
      cell: ({ row }) => getAssetTypeLabel(tAssets, row.getValue('type')),
      enableSorting: false,
    },
    {
      accessorKey: 'healthStatus',
      header: ({ column }) => <DataTableColumnHeader column={column} title={tAssets('columns.health')} />,
      cell: ({ row }) => {
        const status: string = row.getValue('healthStatus');
        const healthIndex = row.original.healthIndex;

        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={assetHealthStatusColors[status]}>
              {tAssets(`healthStatuses.${status.toLowerCase()}`)}
            </Badge>
            {healthIndex != null && <span className="text-muted-foreground text-sm tabular-nums">{healthIndex}</span>}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('words.description')} />,
      cell: ({ row }) => <LongText className="max-w-64">{row.getValue('description') || '-'}</LongText>,
      enableSorting: false,
    },
    {
      id: 'actions',
      cell: DataTableRowActions,
    },
  ];
}
