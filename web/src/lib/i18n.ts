import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import assetsEn from '@/locales/en/assets.json';
import authEn from '@/locales/en/auth.json';
import commonEn from '@/locales/en/common.json';
import dashboardEn from '@/locales/en/dashboard.json';
import deviceSecretsEn from '@/locales/en/deviceSecrets.json';
import devicesEn from '@/locales/en/devices.json';
import deviceTemplatesEn from '@/locales/en/deviceTemplates.json';
import errorsEn from '@/locales/en/errors.json';
import factoriesEn from '@/locales/en/factories.json';
import navEn from '@/locales/en/nav.json';
import notificationsEn from '@/locales/en/notifications.json';
import profileEn from '@/locales/en/profile.json';
import rolesEn from '@/locales/en/roles.json';
import settingsEn from '@/locales/en/settings.json';
import usersEn from '@/locales/en/users.json';
import assetsVi from '@/locales/vi/assets.json';
import authVi from '@/locales/vi/auth.json';
import commonVi from '@/locales/vi/common.json';
import dashboardVi from '@/locales/vi/dashboard.json';
import deviceSecretsVi from '@/locales/vi/deviceSecrets.json';
import devicesVi from '@/locales/vi/devices.json';
import deviceTemplatesVi from '@/locales/vi/deviceTemplates.json';
import errorsVi from '@/locales/vi/errors.json';
import factoriesVi from '@/locales/vi/factories.json';
import navVi from '@/locales/vi/nav.json';
import notificationsVi from '@/locales/vi/notifications.json';
import profileVi from '@/locales/vi/profile.json';
import rolesVi from '@/locales/vi/roles.json';
import settingsVi from '@/locales/vi/settings.json';
import usersVi from '@/locales/vi/users.json';

// One namespace per feature folder under `src/features/` (see also `LanguageProvider` in
// `context/language-context.tsx`, which drives `i18n.changeLanguage`). Keep this list in
// sync with `src/locales/{en,vi}/*.json` — every file there must be registered here.
export const defaultNS = 'common';

export const resources = {
  en: {
    common: commonEn,
    nav: navEn,
    auth: authEn,
    dashboard: dashboardEn,
    devices: devicesEn,
    deviceTemplates: deviceTemplatesEn,
    deviceSecrets: deviceSecretsEn,
    factories: factoriesEn,
    assets: assetsEn,
    notifications: notificationsEn,
    profile: profileEn,
    roles: rolesEn,
    settings: settingsEn,
    users: usersEn,
    errors: errorsEn,
  },
  vi: {
    common: commonVi,
    nav: navVi,
    auth: authVi,
    dashboard: dashboardVi,
    devices: devicesVi,
    deviceTemplates: deviceTemplatesVi,
    deviceSecrets: deviceSecretsVi,
    factories: factoriesVi,
    assets: assetsVi,
    notifications: notificationsVi,
    profile: profileVi,
    roles: rolesVi,
    settings: settingsVi,
    users: usersVi,
    errors: errorsVi,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('vite-ui-language') ?? 'en',
  fallbackLng: 'en',
  defaultNS,
  ns: Object.keys(resources.en),
  interpolation: {
    escapeValue: false, // React already escapes.
  },
  returnNull: false,
});

export default i18n;
