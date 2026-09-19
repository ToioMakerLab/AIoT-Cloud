import { IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useIsGuest } from '@/hooks/use-is-guest';
import { getResponseMessage } from '@/lib/response-codes';
import { usePushConfigSyncMutation, useUpdateDeviceConfigMutation } from '../api/queries';
import type { DevicePushChannel, DeviceTemplateType, IDeviceAlertRule, IDeviceFailsafeConfig } from '../api/types';

interface Props {
  deviceId: string;
  templateType: DeviceTemplateType | undefined;
  pushChannel: DevicePushChannel | undefined;
  alertRules: IDeviceAlertRule[] | null | undefined;
  failsafe: IDeviceFailsafeConfig | null | undefined;
}

/** One rule per line -> trimmed, empty lines dropped. Same shape both text areas below use. */
function parseRuleLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Gateways bridge nodes they don't directly own (e.g. a current-sensing node feeding a relay
 * node), so reacting to a condition fast enough to matter (tripping a relay on over-current)
 * can't wait on a cloud round-trip. These rules are cached and evaluated on the gateway itself —
 * the cloud only stores and ships them down via boot-config, see DeviceAlertRule/DeviceFailsafeConfig.
 */
export function GatewayAutomationPanel({ deviceId, templateType, pushChannel, alertRules, failsafe }: Props) {
  const { t } = useTranslation('devices');
  const updateConfig = useUpdateDeviceConfigMutation();
  const pushConfigSync = usePushConfigSyncMutation(deviceId);
  const isGuest = useIsGuest();
  const [rulesText, setRulesText] = useState((alertRules ?? []).join('\n'));
  const [failsafeEnabled, setFailsafeEnabled] = useState(failsafe?.enabled ?? false);
  const [failsafeRulesText, setFailsafeRulesText] = useState((failsafe?.rules ?? []).join('\n'));

  if (templateType !== 'GATEWAY') {
    return null;
  }

  // Saving alertRules/failsafe only updates the stored config — a gateway won't actually see the
  // change until it next re-fetches boot-config (its own boot/poll cycle), which could be an
  // arbitrarily long wait. Only a KAFKA-push gateway can be nudged to re-fetch right away (see
  // DeviceService.pushConfigSync); MQTT/HTTP gateways have no Kafka connection to receive it on,
  // so they're left to their own poll cycle and just get a heads-up instead.
  const nudgeGateway = async () => {
    if (pushChannel !== 'KAFKA') {
      toast.info(t('gatewayAutomation.pushUnsupportedHint'));
      return;
    }
    try {
      await pushConfigSync.mutateAsync();
      toast.success(t('gatewayAutomation.pushed'));
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  const handleSaveRules = async () => {
    const rules = parseRuleLines(rulesText);
    try {
      await updateConfig.mutateAsync({ id: deviceId, data: { alertRules: rules.length > 0 ? rules : null } });
      toast.success(t('gatewayAutomation.alertRulesSaved'));
      await nudgeGateway();
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  const handleSaveFailsafe = async () => {
    const rules = parseRuleLines(failsafeRulesText);
    try {
      await updateConfig.mutateAsync({
        id: deviceId,
        data: { failsafe: { enabled: failsafeEnabled, rules: rules.length > 0 ? rules : undefined } },
      });
      toast.success(t('gatewayAutomation.failsafeSaved'));
      await nudgeGateway();
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('gatewayAutomation.title')}</CardTitle>
        <CardDescription>{t('gatewayAutomation.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="alert-rules" className="text-muted-foreground text-xs">
            {t('configFields.alertRulesLabel')}
          </Label>
          <Textarea
            id="alert-rules"
            rows={4}
            value={rulesText}
            disabled={isGuest}
            placeholder="amps.value>10:relay_2=OFF"
            onChange={(e) => setRulesText(e.target.value)}
            className="font-mono text-sm"
          />
          {!isGuest && (
            <Button size="sm" onClick={() => void handleSaveRules()} disabled={updateConfig.isPending}>
              {updateConfig.isPending && <IconLoader2 className="h-4 w-4 animate-spin" />}
              {t('gatewayAutomation.saveRules')}
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="font-medium">{t('configFields.failsafe')}</span>
              <p className="text-muted-foreground text-sm">{t('gatewayAutomation.failsafeDescription')}</p>
            </div>
            <Switch checked={failsafeEnabled} disabled={isGuest} onCheckedChange={setFailsafeEnabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="failsafe-rules" className="text-muted-foreground text-xs">
              {t('configFields.failsafeRulesLabel')}
            </Label>
            <Textarea
              id="failsafe-rules"
              rows={3}
              value={failsafeRulesText}
              disabled={isGuest}
              placeholder="relay_2=OFF"
              onChange={(e) => setFailsafeRulesText(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          {!isGuest && (
            <Button size="sm" onClick={() => void handleSaveFailsafe()} disabled={updateConfig.isPending}>
              {updateConfig.isPending && <IconLoader2 className="h-4 w-4 animate-spin" />}
              {t('gatewayAutomation.saveFailsafe')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
