import { useTranslation } from 'react-i18next';
import { type ILegalSection, LegalPage } from './components/legal-page';

export default function Privacy() {
  const { t } = useTranslation('legal');

  return (
    <LegalPage
      title={t('privacy.title')}
      lastUpdated={t('privacy.lastUpdated')}
      intro={t('privacy.intro')}
      sections={t('privacy.sections', { returnObjects: true }) as ILegalSection[]}
    />
  );
}
