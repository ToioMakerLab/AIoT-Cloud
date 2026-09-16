import { IconLoader2, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsGuest } from '@/hooks/use-is-guest';
import { getResponseMessage } from '@/lib/response-codes';
import { cn } from '@/lib/utils';
import { useAssetHealthQuery, useUpdateAssetMutation } from '../api/queries';
import { assetHealthStatusColors, scoreBarColor } from '../data/data';

interface Props {
  assetId: string;
}

/**
 * "Chỉ số sức khỏe thiết bị" — shows the asset's aggregated health index (age vs. expected
 * lifespan, plus the connectivity/telemetry of every device node attached to it, weighted by each
 * node's `healthWeight` — see backend AssetHealthService), and lets an owner set the install
 * date / expected lifespan the age factor is computed from.
 */
export function AssetHealthPanel({ assetId }: Props) {
  const { t } = useTranslation('assets');
  const statusLabels: Record<string, string> = {
    HEALTHY: t('healthStatuses.healthy'),
    WARNING: t('healthStatuses.warning'),
    CRITICAL: t('healthStatuses.critical'),
    UNKNOWN: t('healthStatuses.unknown'),
  };
  const isGuest = useIsGuest();
  const { data: assessment, isLoading, refetch, isFetching } = useAssetHealthQuery(assetId);
  const updateAsset = useUpdateAssetMutation();

  const [installedAt, setInstalledAt] = useState('');
  const [expectedLifespanMonths, setExpectedLifespanMonths] = useState('');

  // Seed the editable fields once the assessment (re)loads — a later refetch just confirms the
  // same values back, since the backend echoes what was just persisted.
  useEffect(() => {
    if (!assessment) return;
    setInstalledAt(assessment.installedAt.slice(0, 10));
    setExpectedLifespanMonths(String(assessment.expectedLifespanMonths));
  }, [assessment]);

  if (isLoading || !assessment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('healthPanel.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('healthPanel.loading')}</p>
        </CardContent>
      </Card>
    );
  }

  const handleSaveConfig = async () => {
    try {
      await updateAsset.mutateAsync({
        id: assetId,
        data: {
          installedAt: installedAt ? new Date(installedAt).toISOString() : null,
          expectedLifespanMonths: expectedLifespanMonths ? Number(expectedLifespanMonths) : null,
        },
      });
      await refetch();
      toast.success(t('healthPanel.settingsSaved'));
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{t('healthPanel.title')}</CardTitle>
          <CardDescription>{t('healthPanel.description')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={assetHealthStatusColors[assessment.status]}>
            {statusLabels[assessment.status]}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isFetching} title={t('healthPanel.recompute')}>
            <IconRefresh className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{assessment.score ?? '—'}</span>
          <span className="text-muted-foreground text-sm">{t('healthPanel.healthIndex')}</span>
        </div>

        <div className="space-y-3">
          {assessment.factors.map((factor) => (
            <div key={factor.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{factor.label}</span>
                <span className="text-muted-foreground tabular-nums">{factor.score}</span>
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div className={cn('h-full rounded-full', scoreBarColor(factor.score))} style={{ width: `${factor.score}%` }} />
              </div>
              <p className="text-muted-foreground text-xs">{factor.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">{t('healthPanel.age')}</span>
          <span>{t('healthPanel.ageMonths', { age: assessment.ageMonths, expected: assessment.expectedLifespanMonths })}</span>
          <span className="text-muted-foreground">{t('healthPanel.remainingLifespan')}</span>
          <span>
            {assessment.remainingLifespanMonths > 0
              ? t('healthPanel.remainingMonths', { months: assessment.remainingLifespanMonths })
              : t('healthPanel.pastExpectedLifespan')}
          </span>
          <span className="text-muted-foreground">{t('healthPanel.lastAssessed')}</span>
          <span>{new Date(assessment.assessedAt).toLocaleString()}</span>
        </div>

        {!isGuest && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-3">
              <Label className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('healthPanel.installedOn')}</span>
                <Input type="date" value={installedAt} onChange={(event) => setInstalledAt(event.target.value)} />
              </Label>
              <Label className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('healthPanel.expectedLifespanMonths')}</span>
                <Input type="number" min={1} value={expectedLifespanMonths} onChange={(event) => setExpectedLifespanMonths(event.target.value)} />
              </Label>
            </div>

            <Button size="sm" onClick={() => void handleSaveConfig()} disabled={updateAsset.isPending}>
              {updateAsset.isPending && <IconLoader2 className="h-4 w-4 animate-spin" />}
              {t('healthPanel.save')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
