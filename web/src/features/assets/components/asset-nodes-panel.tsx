import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDevicesQuery } from '@/features/devices/api/queries';
import { useIsGuest } from '@/hooks/use-is-guest';
import { getResponseMessage } from '@/lib/response-codes';
import { useAttachAssetNodeMutation, useDetachAssetNodeMutation, useUpdateAssetNodeWeightMutation } from '../api/queries';

interface Props {
  assetId: string;
}

/**
 * "Các device node giám sát thiết bị" — attach/detach `DeviceEntity` nodes (sensors, relays, ...) to
 * this asset and set each one's `healthWeight`, the importance it carries in `AssetHealthPanel`'s
 * composite score.
 */
export function AssetNodesPanel({ assetId }: Props) {
  const { t } = useTranslation('assets');
  const isGuest = useIsGuest();
  const { data, isLoading } = useDevicesQuery({ take: 50 });
  const devices = data?.data ?? [];
  const attachedNodes = devices.filter((device) => device.assetId === assetId);
  const availableDevices = devices.filter((device) => !device.assetId);

  const attachNode = useAttachAssetNodeMutation(assetId);
  const updateWeight = useUpdateAssetNodeWeightMutation(assetId);
  const detachNode = useDetachAssetNodeMutation(assetId);

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});

  const handleAttach = async () => {
    if (!selectedDeviceId) return;

    try {
      await attachNode.mutateAsync({ deviceId: selectedDeviceId });
      setSelectedDeviceId('');
      toast.success(t('nodesPanel.attached'));
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  const handleWeightSave = async (deviceId: string) => {
    const draft = weightDrafts[deviceId];

    if (draft === undefined) return;

    try {
      await updateWeight.mutateAsync({ deviceId, data: { healthWeight: Number(draft) } });
      toast.success(t('nodesPanel.weightSaved'));
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  const handleDetach = async (deviceId: string) => {
    try {
      await detachNode.mutateAsync(deviceId);
      toast.success(t('nodesPanel.detached'));
    } catch (error) {
      toast.error(getResponseMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('nodesPanel.title')}</CardTitle>
        <CardDescription>{t('nodesPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('nodesPanel.loading')}</p>
        ) : attachedNodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('nodesPanel.noNodes')}</p>
        ) : (
          <div className="space-y-2">
            {attachedNodes.map((node) => (
              <div key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{node.name}</span>
                  <Badge variant={node.status === 'ONLINE' ? 'default' : 'secondary'}>{node.status}</Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{t('nodesPanel.weight')}</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8 w-20"
                    disabled={isGuest}
                    value={weightDrafts[node.id] ?? String(node.healthWeight ?? 1)}
                    onChange={(event) => setWeightDrafts((prev) => ({ ...prev, [node.id]: event.target.value }))}
                    onBlur={() => void handleWeightSave(node.id)}
                  />
                  {!isGuest && (
                    <Button variant="ghost" size="icon" onClick={() => void handleDetach(node.id)} disabled={detachNode.isPending}>
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isGuest && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t('nodesPanel.selectDevice')} />
              </SelectTrigger>
              <SelectContent>
                {availableDevices.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-sm">{t('nodesPanel.noAvailableDevices')}</div>
                ) : (
                  availableDevices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void handleAttach()} disabled={!selectedDeviceId || attachNode.isPending}>
              {attachNode.isPending && <IconLoader2 className="h-4 w-4 animate-spin" />}
              {t('nodesPanel.attach')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
