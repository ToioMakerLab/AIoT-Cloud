import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/components/language-switch';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { NotificationsNav } from '@/components/notifications-nav';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssetQuery } from './api/queries';
import { AssetHealthPanel } from './components/asset-health-panel';
import { AssetNodesPanel } from './components/asset-nodes-panel';
import { assetHealthStatusColors, getAssetTypeLabel } from './data/data';

export default function AssetDetail() {
  const { t } = useTranslation('assets');
  const { assetId } = useParams({ from: '/_authenticated/assets/$assetId' });
  const { data, isLoading } = useAssetQuery(assetId);
  const asset = data;

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <LanguageSwitch />
          <NotificationsNav />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link to="/assets">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToAssets')}
          </Link>
        </Button>

        {isLoading ? (
          <p className="text-muted-foreground">{t('detail.loading')}</p>
        ) : !asset ? (
          <p className="text-muted-foreground">{t('detail.notFound')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{asset.name}</h2>
                <p className="text-muted-foreground text-sm">{getAssetTypeLabel(t, asset.type)}</p>
              </div>
              <Badge variant="outline" className={assetHealthStatusColors[asset.healthStatus]}>
                {t(`healthStatuses.${asset.healthStatus.toLowerCase()}`)}
              </Badge>
            </div>

            {asset.description && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('detail.overview')}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p>{asset.description}</p>
                </CardContent>
              </Card>
            )}

            <AssetHealthPanel assetId={assetId} />
            <AssetNodesPanel assetId={assetId} />
          </div>
        )}
      </Main>
    </>
  );
}
