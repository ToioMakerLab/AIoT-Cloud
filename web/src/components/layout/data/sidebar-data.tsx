import {
  IconBuildingFactory2,
  IconCpu,
  IconEngine,
  IconHelp,
  IconKey,
  IconLayoutDashboard,
  IconNotification,
  IconPalette,
  IconRouter,
  IconSettings,
  IconShieldLock,
  IconTool,
  IconUserCog,
  IconUsers,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { SidebarData } from '../types';

// Static `sidebarData` was replaced by this hook so nav titles can be translated
// (see `LanguageProvider`/`useTranslation('nav')`) — the shape (icons/urls/groups) is unchanged.
export function useSidebarData(): SidebarData {
  const { t } = useTranslation('nav');

  return {
    user: {
      name: 'vkhangstack',
      email: 'vkhangstack@gmail.com',
      avatar: '/avatars/shadcn.jpg',
    },
    navGroups: [
      {
        title: t('groups.iot'),
        items: [
          {
            title: t('items.dashboard'),
            url: '/',
            icon: IconLayoutDashboard,
          },
          {
            title: t('items.devices'),
            url: '/devices',
            icon: IconCpu,
          },
          {
            title: t('items.assets'),
            url: '/assets',
            icon: IconEngine,
          },
          {
            title: t('items.deviceTemplates'),
            url: '/device-templates',
            icon: IconRouter,
          },
          {
            title: t('items.deviceSecrets'),
            url: '/device-secrets',
            icon: IconKey,
          },
          {
            title: t('items.users'),
            url: '/users',
            icon: IconUsers,
          },
          {
            title: t('items.factories'),
            url: '/factories',
            icon: IconBuildingFactory2,
          },
        ],
      },
      {
        title: t('groups.other'),
        items: [
          {
            title: t('items.myAccount'),
            url: '/profile',
            icon: IconUserCog,
          },
          {
            title: t('items.settings'),
            icon: IconSettings,
            items: [
              {
                title: t('items.settingsProfile'),
                url: '/settings',
                icon: IconUserCog,
              },
              {
                title: t('items.settingsAccount'),
                url: '/settings/account',
                icon: IconTool,
              },
              {
                title: t('items.settingsAppearance'),
                url: '/settings/appearance',
                icon: IconPalette,
              },
              {
                title: t('items.settingsNotifications'),
                url: '/settings/notifications',
                icon: IconNotification,
              },
              {
                title: t('items.settingsRoles'),
                url: '/settings/roles',
                icon: IconShieldLock,
              },
            ],
          },
          {
            title: t('items.helpCenter'),
            url: '/help-center',
            icon: IconHelp,
          },
        ],
      },
    ],
  };
}
