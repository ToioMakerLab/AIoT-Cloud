'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconDeviceUnknown, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectDropdown } from '@/components/select-dropdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCreateDeviceTemplateMutation, useUpdateDeviceTemplateMutation } from '../api/queries';
import { getDeviceTemplateTypeMeta, getDeviceTemplateTypes } from '../data/data';
import type { DeviceTemplate } from '../data/schema';
import { actionFieldSchema, deviceTemplateTypeSchema, telemetryFieldSchema } from '../data/schema';

function buildFormSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z.object({
    name: z.string().min(1, { message: t('actionDialog.nameRequired') }),
    type: deviceTemplateTypeSchema,
    manufacturer: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    isActive: z.boolean(),
    telemetrySchema: z.array(telemetryFieldSchema),
    actionSchema: z.array(actionFieldSchema),
  });
}
type DeviceTemplateForm = z.infer<ReturnType<typeof buildFormSchema>>;

function newChannel(index: number, t: (key: string, options?: Record<string, unknown>) => string) {
  return {
    key: `channel${index}`,
    label: t('actionDialog.channelN', { index }),
    type: 'TOGGLE' as const,
    onValue: 'ON',
    offValue: 'OFF',
  };
}

function newTelemetryField(index: number, t: (key: string, options?: Record<string, unknown>) => string) {
  return {
    key: `field${index}`,
    label: t('actionDialog.fieldN', { index }),
    unit: '',
    warningMin: undefined,
    warningMax: undefined,
  };
}

interface Props {
  currentRow?: DeviceTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeviceTemplatesActionDialog({ currentRow, open, onOpenChange }: Props) {
  const { t } = useTranslation('deviceTemplates');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!currentRow;
  const formSchema = useMemo(() => buildFormSchema(t), [t]);
  const deviceTemplateTypes = useMemo(() => getDeviceTemplateTypes(t), [t]);
  const createDeviceTemplate = useCreateDeviceTemplateMutation();
  const updateDeviceTemplate = useUpdateDeviceTemplateMutation();
  const isSubmitting = createDeviceTemplate.isPending || updateDeviceTemplate.isPending;

  const form = useForm<DeviceTemplateForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          name: currentRow.name,
          type: currentRow.type,
          manufacturer: currentRow.manufacturer ?? '',
          description: currentRow.description ?? '',
          icon: currentRow.icon ?? undefined,
          isActive: currentRow.isActive,
          telemetrySchema: currentRow.telemetrySchema ?? [],
          actionSchema: currentRow.actionSchema ?? [],
        }
      : {
          name: '',
          type: 'SENSOR_NODE',
          manufacturer: '',
          description: '',
          icon: '',
          isActive: true,
          telemetrySchema: [],
          actionSchema: [],
        },
  });
  const telemetryFields = useFieldArray({
    control: form.control,
    name: 'telemetrySchema',
  });
  const actionFields = useFieldArray({
    control: form.control,
    name: 'actionSchema',
  });

  const onSubmit = async (values: DeviceTemplateForm) => {
    try {
      if (isEdit && currentRow) {
        await updateDeviceTemplate.mutateAsync({
          id: currentRow.id,
          data: values,
        });
        toast.success(t('actionDialog.updated'));
      } else {
        await createDeviceTemplate.mutateAsync(values);
        toast.success(t('actionDialog.created'));
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // The backend returns business failures (e.g. duplicate name) as
      // HTTP 200 with a non-zero `error` code, so they surface here as a
      // thrown Error rather than an AxiosError the global mutation error
      // handler can parse — toast the message explicitly.
      toast.error(error instanceof Error ? error.message : tCommon('errors.somethingWentWrong'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset();
        onOpenChange(state);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>{isEdit ? t('actionDialog.editTitle') : t('actionDialog.addTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('actionDialog.editDescription') : t('actionDialog.addDescription')} {t('actionDialog.clickSaveHint')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="device-template-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-0.5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{tCommon('words.name')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Input placeholder="Soil Moisture Sensor v2" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{tCommon('words.type')}</FormLabel>
                  <SelectDropdown
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder={t('actionDialog.selectType')}
                    className="col-span-4"
                    items={deviceTemplateTypes.map(({ label, value }) => ({
                      label,
                      value,
                    }))}
                  />
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manufacturer"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{t('actionDialog.manufacturer')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Input placeholder="Acme Sensors Inc." {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => {
                // No icon set (or not an image URL) -> preview the same type-based fallback
                // DeviceImage (dashboard/components/device-panel.tsx) falls back to at display time,
                // so what's shown here is exactly what devices using this template will get.
                const FallbackIcon = getDeviceTemplateTypeMeta(form.watch('type'))?.icon ?? IconDeviceUnknown;
                const isImageUrl = !!field.value && /^(https?:\/\/|\/)/.test(field.value);
                return (
                  <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                    <FormLabel className="col-span-2 text-right">{t('actionDialog.icon')}</FormLabel>
                    <div className="col-span-4 flex items-center gap-2">
                      <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded">
                        {isImageUrl ? (
                          <img src={field.value} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <FallbackIcon className="text-muted-foreground h-4 w-4" />
                        )}
                      </div>
                      <FormControl>
                        <Input placeholder={t('actionDialog.iconPlaceholder')} {...field} />
                      </FormControl>
                    </div>
                    <FormDescription className="col-span-4 col-start-3">{t('actionDialog.iconHint')}</FormDescription>
                    <FormMessage className="col-span-4 col-start-3" />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{tCommon('words.description')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Textarea placeholder={t('actionDialog.descriptionPlaceholder')} className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{tCommon('words.active')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            {/* Telemetry fields apply to every template type, not just sensors — a GATEWAY reports its
                own health as telemetry (uptime, CPU load, ...) and a RELAY_CURRENT_NODE pairs its
                relay channels below with per-channel current readings here. */}
            <div className="grid grid-cols-6 items-start gap-x-4 gap-y-1">
              <FormLabel className="col-span-2 pt-2 text-right">{t('actionDialog.telemetryFields')}</FormLabel>
              <div className="col-span-4 space-y-3">
                {telemetryFields.fields.map((field, index) => (
                  <div key={field.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`telemetrySchema.${index}.key`}
                        render={({ field: keyField }) => (
                          <FormItem className="flex-1 space-y-0">
                            <FormControl>
                              <Input placeholder={t('actionDialog.key')} {...keyField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`telemetrySchema.${index}.label`}
                        render={({ field: labelField }) => (
                          <FormItem className="flex-1 space-y-0">
                            <FormControl>
                              <Input placeholder={tCommon('words.label')} {...labelField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`telemetrySchema.${index}.unit`}
                        render={({ field: unitField }) => (
                          <FormItem className="w-20 space-y-0">
                            <FormControl>
                              <Input placeholder={t('actionDialog.unit')} {...unitField} value={unitField.value ?? ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => telemetryFields.remove(index)}>
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`telemetrySchema.${index}.warningMin`}
                        render={({ field: minField }) => (
                          <FormItem className="flex-1 space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                placeholder={t('actionDialog.warningMin')}
                                value={minField.value ?? ''}
                                onChange={(e) => minField.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`telemetrySchema.${index}.warningMax`}
                        render={({ field: maxField }) => (
                          <FormItem className="flex-1 space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                placeholder={t('actionDialog.warningMax')}
                                value={maxField.value ?? ''}
                                onChange={(e) => maxField.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => telemetryFields.append(newTelemetryField(telemetryFields.fields.length + 1, t))}
                >
                  <IconPlus className="size-4" />
                  {t('actionDialog.addField')}
                </Button>
              </div>
            </div>
            {/* RELAY_CURRENT_NODE pairs these same relay channels with a current sensor (its extra
                reading lives in telemetrySchema above), and GATEWAY defines its own `restart`
                BUTTON action — not just RELAY_NODE. */}
            {['RELAY_NODE', 'RELAY_CURRENT_NODE', 'GATEWAY'].includes(form.watch('type')) ? (
              <div className="grid grid-cols-6 items-start gap-x-4 gap-y-1">
                <FormLabel className="col-span-2 pt-2 text-right">{t('actionDialog.channels')}</FormLabel>
                <div className="col-span-4 space-y-3">
                  {actionFields.fields.map((field, index) => {
                    const type = form.watch(`actionSchema.${index}.type`);
                    return (
                      <div key={field.id} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center gap-2">
                          <FormField
                            control={form.control}
                            name={`actionSchema.${index}.key`}
                            render={({ field: keyField }) => (
                              <FormItem className="flex-1 space-y-0">
                                <FormControl>
                                  <Input placeholder={t('actionDialog.key')} {...keyField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`actionSchema.${index}.label`}
                            render={({ field: labelField }) => (
                              <FormItem className="flex-1 space-y-0">
                                <FormControl>
                                  <Input placeholder={tCommon('words.label')} {...labelField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => actionFields.remove(index)}>
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <FormField
                            control={form.control}
                            name={`actionSchema.${index}.type`}
                            render={({ field: typeField }) => (
                              <FormItem className="w-32 space-y-0">
                                <SelectDropdown
                                  defaultValue={typeField.value}
                                  onValueChange={typeField.onChange}
                                  placeholder={tCommon('words.type')}
                                  items={[
                                    { label: t('actionDialog.toggle'), value: 'TOGGLE' },
                                    { label: t('actionDialog.button'), value: 'BUTTON' },
                                  ]}
                                />
                              </FormItem>
                            )}
                          />
                          {type === 'TOGGLE' ? (
                            <>
                              <FormField
                                control={form.control}
                                name={`actionSchema.${index}.onValue`}
                                render={({ field: onField }) => (
                                  <FormItem className="flex-1 space-y-0">
                                    <FormControl>
                                      <Input placeholder={t('actionDialog.onValue')} {...onField} value={onField.value ?? ''} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name={`actionSchema.${index}.offValue`}
                                render={({ field: offField }) => (
                                  <FormItem className="flex-1 space-y-0">
                                    <FormControl>
                                      <Input placeholder={t('actionDialog.offValue')} {...offField} value={offField.value ?? ''} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => actionFields.append(newChannel(actionFields.fields.length + 1, t))}
                  >
                    <IconPlus className="size-4" />
                    {t('actionDialog.addChannel')}
                  </Button>
                </div>
              </div>
            ) : null}
          </form>
        </Form>
        <DialogFooter>
          <Button type="submit" form="device-template-form" disabled={isSubmitting}>
            {tCommon('actions.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
