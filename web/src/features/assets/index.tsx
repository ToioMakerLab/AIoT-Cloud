import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/components/language-switch';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { NotificationsNav } from '@/components/notifications-nav';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { useAssetsQuery } from './api/queries';
import { mapIAssetToAsset } from './api/utils';
import { useAssetsColumns } from './components/assets-columns';
import { AssetsDialogs } from './components/assets-dialogs';
import { AssetsPrimaryButtons } from './components/assets-primary-buttons';
import { AssetsTable } from './components/assets-table';
import AssetsProvider from './context/assets-context';

// Backend caps `take` at 50 (see PageOptionsDto), so this fetches a single large page and
// paginates/filters client-side, same as the `factories`/`device-templates` features.
export default function Assets() {
  const { t } = useTranslation('assets');
  const { data } = useAssetsQuery({ take: 50, order: 'DESC' });
  const assetList = data?.data?.map(mapIAssetToAsset) ?? [];
  const columns = useAssetsColumns();

  return (
    <AssetsProvider>
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
        <div className="mb-2 flex flex-wrap items-center justify-between space-y-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('list.title')}</h2>
            <p className="text-muted-foreground">{t('list.subtitle')}</p>
          </div>
          <AssetsPrimaryButtons />
        </div>
        <div className="-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12">
          <AssetsTable data={assetList} columns={columns} />
        </div>
      </Main>

      <AssetsDialogs />
    </AssetsProvider>
  );
}
