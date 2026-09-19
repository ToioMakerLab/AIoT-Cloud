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
import { useDeviceQuery } from './api/queries';
import { DeviceActionsPanel } from './components/device-actions-panel';
import { DeviceLifecyclePanel } from './components/device-lifecycle-panel';
import { DeviceOtaPanel } from './components/device-ota-panel';
import { GatewayAutomationPanel } from './components/gateway-automation-panel';
import { OfflineAlertPanel } from './components/offline-alert-panel';
import { TelemetryHistoryPanel } from './components/telemetry-history-panel';
import { WarningGatesPanel } from './components/warning-gates-panel';
import { deviceStatusColors, getDevicePushChannelLabel } from './data/data';
import type { DeviceStatus } from './data/schema';

export default function DeviceDetail() {
  const { t } = useTranslation('devices');
  const { deviceId } = useParams({ from: '/_authenticated/devices/$deviceId' });
  const { data, isLoading } = useDeviceQuery(deviceId);
  const device = data?.data;

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
          <Link to="/devices">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToDevices')}
          </Link>
        </Button>

        {isLoading ? (
          <p className="text-muted-foreground">{t('detail.loading')}</p>
        ) : !device ? (
          <p className="text-muted-foreground">{t('detail.notFound')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{device.name}</h2>
                <p className="text-muted-foreground font-mono text-sm">{device.deviceId}</p>
              </div>
              <Badge variant="outline" className={deviceStatusColors.get(device.status as DeviceStatus)}>
                {device.status}
              </Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.overview')}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">{t('detail.template')}</span>
                <span>{device.template?.name ?? '—'}</span>
                <span className="text-muted-foreground">{t('detail.pushChannel')}</span>
                <span>{getDevicePushChannelLabel(device.pushChannel)}</span>
                <span className="text-muted-foreground">{t('detail.lastSeen')}</span>
                <span>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : t('detail.never')}</span>
                {device.assetId && (
                  <>
                    <span className="text-muted-foreground">{t('detail.linkedAsset')}</span>
                    <Link to="/assets/$assetId" params={{ assetId: device.assetId }} className="w-fit hover:underline">
                      {t('detail.viewAsset')}
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            <DeviceActionsPanel
              deviceId={device.id}
              actionSchema={device.template?.actionSchema}
              channelSupported={device.pushChannel === 'MQTT' || device.pushChannel === 'KAFKA'}
            />

            <DeviceLifecyclePanel deviceId={device.id} />

            <DeviceOtaPanel
              deviceId={device.id}
              templateId={device.templateId}
              channelSupported={device.pushChannel === 'MQTT' || device.pushChannel === 'KAFKA'}
            />

            <TelemetryHistoryPanel
              deviceId={device.id}
              deviceCode={device.deviceId}
              deviceName={device.name}
              telemetrySchema={device.template?.telemetrySchema}
            />

            <WarningGatesPanel deviceId={device.id} telemetrySchema={device.template?.telemetrySchema} warningOverrides={device.warningOverrides} />

            <OfflineAlertPanel deviceId={device.id} templateType={device.template?.type} offlineAlert={device.offlineAlert} />

            <GatewayAutomationPanel
              deviceId={device.id}
              templateType={device.template?.type}
              pushChannel={device.pushChannel}
              alertRules={device.alertRules}
              failsafe={device.failsafe}
            />
          </div>
        )}
      </Main>
    </>
  );
}
