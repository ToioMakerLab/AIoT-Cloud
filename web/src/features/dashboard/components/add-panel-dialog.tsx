import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { IDashboardWidget, IDevice, WidgetType } from '../api/types';

function buildFormSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z.object({
    deviceId: z.string().min(1, { message: t('addPanel.deviceRequired') }),
    widgetType: z.enum(['VALUE', 'CHART', 'ACTION']),
    field: z.string().min(1, { message: t('addPanel.fieldRequired') }),
    title: z.string().min(1, { message: t('addPanel.titleRequired') }),
  });
}
type AddPanelForm = z.infer<ReturnType<typeof buildFormSchema>>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: IDevice[];
  nextSlot: { x: number; y: number };
  onAdd: (widget: IDashboardWidget) => void;
}

export function AddPanelDialog({ open, onOpenChange, devices, nextSlot, onAdd }: Props) {
  const { t } = useTranslation('dashboard');
  const formSchema = useMemo(() => buildFormSchema(t), [t]);
  const form = useForm<AddPanelForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { deviceId: '', widgetType: 'VALUE', field: '', title: '' },
  });

  // Reset the form each time the dialog is (re)opened so stale values from a previous
  // panel don't leak into the next one.
  useEffect(() => {
    if (open) {
      form.reset({ deviceId: '', widgetType: 'VALUE', field: '', title: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.reset]);

  const deviceId = form.watch('deviceId');
  const widgetType = form.watch('widgetType');
  const selectedDevice = devices.find((device) => device.id === deviceId);
  const channels = selectedDevice?.template?.actionSchema ?? [];

  // The `field` value (telemetry field name vs. action channel key) is only meaningful for
  // one widget type at a time, so clear it whenever the device or widget type changes to
  // avoid submitting a stale telemetry field as a channel key or vice versa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when device/widgetType change, not on every form.setValue identity change
  useEffect(() => {
    form.setValue('field', '');
  }, [deviceId, widgetType]);

  const onSubmit = (values: AddPanelForm) => {
    onAdd({
      id: crypto.randomUUID(),
      deviceId: values.deviceId,
      widgetType: values.widgetType as WidgetType,
      field: values.field,
      title: values.title,
      x: nextSlot.x,
      y: nextSlot.y,
      // 4 (not 3) out of the grid's 12 columns: three panels then tile into a full row (4+4+4=12)
      // instead of leaving a quarter of the row empty — the common case of a freshly built dashboard.
      w: 4,
      h: 2,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        onOpenChange(state);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addPanel.title')}</DialogTitle>
          <DialogDescription>{t('addPanel.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="add-panel-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="deviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('addPanel.device')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('addPanel.selectDevice')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {devices.length === 0 && <div className="text-muted-foreground px-2 py-1.5 text-sm">{t('addPanel.noDevices')}</div>}
                      {devices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.name} ({device.deviceId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="widgetType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('addPanel.widgetType')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="VALUE">{t('addPanel.value')}</SelectItem>
                      <SelectItem value="CHART">{t('addPanel.chart')}</SelectItem>
                      <SelectItem value="ACTION">{t('addPanel.action')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {widgetType === 'ACTION' ? (
              <FormField
                control={form.control}
                name="field"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('addPanel.channel')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('addPanel.selectChannel')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {channels.length === 0 && <div className="text-muted-foreground px-2 py-1.5 text-sm">{t('addPanel.noChannels')}</div>}
                        {channels.map((channel) => (
                          <SelectItem key={channel.key} value={channel.key}>
                            {channel.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="field"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('addPanel.telemetryField')}</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. temperature" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('addPanel.panelTitle')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('addPanel.panelTitlePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="submit" form="add-panel-form">
            {t('addPanel.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
