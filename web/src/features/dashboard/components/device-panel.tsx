import { IconBolt, IconCpu, IconDeviceUnknown, IconRouter, IconServer2, IconX } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PowerSwitchButton } from '@/components/ui/power-switch-button';
import { useIsGuest } from '@/hooks/use-is-guest';
import { getChartColor } from '@/lib/chart-colors';
import type { ResolvedTimeRange } from '@/lib/time-range';
import { cn } from '@/lib/utils';
import { useDeviceTelemetryHistoryQuery, useTriggerDeviceActionMutation } from '../api/queries';
import type { IDashboardWidget, IDevice, IDeviceTemplate } from '../api/types';
import type { ILatestTelemetry, ITelemetryPoint } from '../hooks/telemetry-types';
import type { ActionResultEventPayload } from '../hooks/use-device-socket';

interface Props {
  widget: IDashboardWidget;
  device: IDevice | undefined;
  latest: ILatestTelemetry | undefined;
  history: ITelemetryPoint[];
  actionResult: ActionResultEventPayload | undefined;
  seedHistory: (deviceId: string, points: ITelemetryPoint[], key: string) => void;
  timeRange: ResolvedTimeRange;
  onRemove: () => void;
}

// Fallback icon per template type, used whenever the template's own `icon` isn't an image URL —
// same mapping as device-templates' data.ts, duplicated here per this feature's "self-contained
// types" convention (see api/types.ts).
const TEMPLATE_TYPE_ICONS: Record<string, typeof IconCpu> = {
  SENSOR_NODE: IconCpu,
  RELAY_NODE: IconRouter,
  RELAY_CURRENT_NODE: IconBolt,
  GATEWAY: IconServer2,
  OTHER: IconDeviceUnknown,
};

/** Small image/icon that visually represents a device, based on its template. */
function DeviceImage({ template }: { template: IDeviceTemplate | undefined }) {
  const { t } = useTranslation('dashboard');
  const icon = template?.icon;
  const isImageUrl = !!icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/'));

  if (isImageUrl) {
    return <img src={icon} alt={template?.name ?? t('panel.device')} className="h-8 w-8 shrink-0 rounded object-cover" />;
  }

  const FallbackIcon = (template?.type && TEMPLATE_TYPE_ICONS[template.type]) || IconDeviceUnknown;
  return (
    <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded">
      <FallbackIcon className="text-muted-foreground h-4 w-4" />
    </div>
  );
}

// How long an ACTION panel shows its optimistic (just-clicked) value before giving up on a real
// `channelState` confirmation and reverting to whatever `currentValue` actually says. Bounds how
// long the switch can lie about the device's real state if the gateway never confirms (wrong
// topic, offline, etc.) — see device-panel's `handleTrigger`.
const OPTIMISTIC_ACTION_TIMEOUT_MS = 8_000;

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '--';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function DevicePanel({ widget, device, latest, history, actionResult, seedHistory, timeRange, onRemove }: Props) {
  const { t } = useTranslation('dashboard');
  // Seed the rolling history buffer once fetched — combined with any live telemetry already
  // appended by the WebSocket live-data source, this gives charts both history and a live tail.
  // Bounded by the dashboard's time-range filter (see @/lib/time-range); `timeRange.key` is what lets
  // seedHistory tell "the same range refetched" apart from "the user picked a different range".
  const { data: fetchedHistory } = useDeviceTelemetryHistoryQuery(widget.deviceId, { from: timeRange.from, to: timeRange.to });
  const isGuest = useIsGuest();

  // biome-ignore lint/correctness/useExhaustiveDependencies: seedHistory is an unstable reference from the parent's live-data hook; adding it would re-run the effect on every render.
  useEffect(() => {
    // `fetchedHistory` is `undefined` only while still loading — an empty array is a resolved "no
    // telemetry in this range" and must still seed (as empty), otherwise switching to an empty
    // range would leave the previous range's points on screen.
    if (fetchedHistory) {
      seedHistory(
        widget.deviceId,
        fetchedHistory.map((t) => ({
          payload: t.payload,
          recordedAt: t.recordedAt,
        })),
        timeRange.key,
      );
    }
  }, [fetchedHistory, widget.deviceId, timeRange.key]);

  const field = widget.field ?? '';
  const lastPoint = history[history.length - 1];
  // Priority: live WS data (telemetry or a channelState confirmation, whichever arrived last —
  // both land in `latest.payload`, see use-device-socket.ts) > last fetched history point > the
  // device's persisted `channelStates` from its last confirmed action, so an ACTION panel shows
  // the real last-applied value on first load instead of "--" until the next live event.
  const currentValue = latest?.payload[field] ?? lastPoint?.payload[field] ?? device?.channelStates?.[field];
  const lastUpdated = latest?.recordedAt ?? lastPoint?.recordedAt;
  const isOnline = device?.status === 'ONLINE';

  const actionDef = device?.template?.actionSchema?.find((a) => a.key === field);
  const triggerAction = useTriggerDeviceActionMutation(widget.deviceId);

  // Echoes the value this panel just told the device to become, shown immediately instead of
  // waiting out the real round trip (cloud -> Kafka -> gateway -> MQTT -> device, then back via
  // devices.cloud.events -> channelState WS event, see use-device-socket.ts). Cleared as soon as
  // `currentValue` itself reports the same value (real confirmation caught up) or after
  // OPTIMISTIC_ACTION_TIMEOUT_MS with no confirmation — must not leave the switch showing a value
  // the device never actually confirmed applying.
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null);

  useEffect(() => {
    if (optimisticValue !== null && currentValue !== undefined && String(currentValue) === optimisticValue) {
      setOptimisticValue(null);
    }
  }, [currentValue, optimisticValue]);

  useEffect(() => {
    if (optimisticValue === null) return;
    const timer = setTimeout(() => setOptimisticValue(null), OPTIMISTIC_ACTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [optimisticValue]);

  // The gateway explicitly reported this channel's command failed to apply — revert the optimistic
  // switch position right away instead of leaving it lying until OPTIMISTIC_ACTION_TIMEOUT_MS
  // expires. A success result needs no handling here: it lands in `currentValue` via `channelState`
  // (see use-device-socket.ts), which the effect above already resolves against.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keying on actionResult.changedAt (not the whole object, optimisticValue, or actionDef) so this fires exactly once per pushed event.
  useEffect(() => {
    if (!actionResult || actionResult.key !== field || actionResult.status !== 'error') return;
    if (optimisticValue === null) return;
    setOptimisticValue(null);
    toast.error(
      actionResult.error ? `${actionDef?.label ?? field}: ${actionResult.error}` : t('panel.failedToApply', { label: actionDef?.label ?? field }),
    );
  }, [actionResult?.changedAt]);

  const handleTrigger = (value: string) => {
    if (!actionDef) return;
    setOptimisticValue(value);
    triggerAction.mutate(
      { key: actionDef.key, value },
      {
        onSuccess: () => toast.success(`${actionDef.label} -> ${value}`),
        onError: (error) => {
          // Command never even made it out — nothing to wait a confirmation for, revert right away.
          setOptimisticValue(null);
          toast.error(error instanceof Error ? error.message : t('panel.failedToSendAction'));
        },
      },
    );
  };

  // Relay nodes (and other devices whose action is a stateful on/off, not a momentary press) use a
  // real toggle switch instead of separate On/Off buttons — its position reflects the optimistic
  // value right after a click, falling back to the latest confirmed telemetry/channelState value.
  const displayValue = optimisticValue ?? currentValue;
  const isToggleAction = actionDef?.type === 'TOGGLE';
  const isToggleOn = isToggleAction && displayValue !== undefined && String(displayValue) === String(actionDef?.onValue ?? 'ON');
  const isAwaitingConfirmation = optimisticValue !== null;
  const handleToggle = (checked: boolean) => {
    if (!actionDef) return;
    handleTrigger(checked ? (actionDef.onValue ?? 'ON') : (actionDef.offValue ?? 'OFF'));
  };

  // `recordedAt` stays a raw timestamp (not pre-formatted) so the XAxis tick and the tooltip label
  // can each format it differently below: a compact time-only tick on the axis, and the full
  // date + time on hover.
  const chartData = history.map((point) => ({
    recordedAt: point.recordedAt,
    value: typeof point.payload[field] === 'number' ? (point.payload[field] as number) : null,
  }));

  // Same name -> same color every render/reload, so panels stay visually distinct from each other
  // without color reshuffling on you between page loads.
  const panelName = widget.title || device?.name || t('panel.panel');
  const chartColor = getChartColor(panelName);

  return (
    <Card className="flex h-full w-full flex-col overflow-hidden py-3 gap-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <DeviceImage template={device?.template} />
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-medium">{panelName}</CardTitle>
            <p className="text-muted-foreground truncate text-xs">
              {device?.name ?? widget.deviceId} · {(widget.widgetType === 'ACTION' ? actionDef?.label : field) || t('panel.noField')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-green-500' : 'bg-muted-foreground/40')}
            title={isOnline ? t('panel.online') : t('panel.offline')}
          />
          {!isGuest && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} aria-label={t('panel.removePanel')}>
              <IconX className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        {widget.widgetType === 'ACTION' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            {actionDef ? (
              isToggleAction ? (
                <div className="flex flex-col items-center gap-1">
                  <PowerSwitchButton
                    type="button"
                    variant="round"
                    checked={isToggleOn}
                    disabled={isGuest || !isOnline || triggerAction.isPending}
                    onCheckedChange={handleToggle}
                    onLabel={actionDef.onValue ?? 'ON'}
                    offLabel={actionDef.offValue ?? 'OFF'}
                  />
                  {isAwaitingConfirmation && <span className="text-muted-foreground animate-pulse text-xs">…</span>}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size={'lg'}
                    disabled={isGuest || !isOnline || triggerAction.isPending}
                    onClick={() => handleTrigger(actionDef.onValue ?? 'ON')}
                  >
                    {t('panel.on')}
                  </Button>
                  <Button
                    variant="outline"
                    size={'lg'}
                    disabled={isGuest || !isOnline || triggerAction.isPending}
                    onClick={() => handleTrigger(actionDef.offValue ?? 'OFF')}
                  >
                    {t('panel.off')}
                  </Button>
                </div>
              )
            ) : (
              <span className="text-muted-foreground text-xs">{t('panel.channelNotFound')}</span>
            )}
            {!isOnline && <span className="text-muted-foreground text-xs">{t('panel.deviceOffline')}</span>}
          </div>
        ) : widget.widgetType === 'VALUE' ? (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <span className="text-3xl font-bold">{formatValue(currentValue)}</span>
            <span className="text-muted-foreground text-xs">
              {lastUpdated ? t('panel.updated', { time: new Date(lastUpdated).toLocaleTimeString() }) : t('panel.noDataYet')}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`${widget.id}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="recordedAt"
                tick={{ fontSize: 10 }}
                minTickGap={20}
                tickFormatter={(value: string) => new Date(value).toLocaleTimeString()}
              />
              <YAxis tick={{ fontSize: 10 }} width={36} />
              <Tooltip
                labelFormatter={(label) => (typeof label === 'string' ? format(new Date(label), 'HH:mm:ss dd/MM/yyyy') : label)}
              />
              {/* connectNulls: a point whose payload doesn't carry this field maps to `value: null` above —
                  without this, recharts breaks the area at every such gap instead of drawing straight
                  through to the next real point, making it look chopped into disconnected segments.
                  dot: an area/line needs 2+ points to draw anything at all — a freshly-added device
                  with only one point seeded/live so far would otherwise render a totally blank chart,
                  so show a marker dot whenever there isn't enough history yet to draw a real line. */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                fill={`url(#${widget.id}-fill)`}
                dot={chartData.length <= 1 ? { r: 3, fill: chartColor, stroke: chartColor } : false}
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
