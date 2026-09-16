import { useTranslation } from 'react-i18next';
import { type ILegalSection, LegalPage } from './components/legal-page';

export default function Terms() {
  const { t } = useTranslation('legal');

  return (
    <LegalPage
      title={t('terms.title')}
      lastUpdated={t('terms.lastUpdated')}
      intro={t('terms.intro')}
      sections={t('terms.sections', { returnObjects: true }) as ILegalSection[]}
    />
  );
}
