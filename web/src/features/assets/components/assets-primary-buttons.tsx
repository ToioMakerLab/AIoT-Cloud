import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useIsGuest } from '@/hooks/use-is-guest';
import { useAssets } from '../context/assets-context';

export function AssetsPrimaryButtons() {
  const { t } = useTranslation('assets');
  const { setOpen } = useAssets();
  const isGuest = useIsGuest();

  if (isGuest) return null;

  return (
    <div className="flex gap-2">
      <Button className="space-x-1" onClick={() => setOpen('add')}>
        <span>{t('primaryButtons.addAsset')}</span> <IconPlus size={18} />
      </Button>
    </div>
  );
}
