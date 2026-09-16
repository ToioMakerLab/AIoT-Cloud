'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectDropdown } from '@/components/select-dropdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAssetMutation, useUpdateAssetMutation } from '../api/queries';
import { getAssetTypes } from '../data/data';
import type { Asset } from '../data/schema';

function buildFormSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z.object({
    name: z.string().min(1, { message: t('actionDialog.nameRequired') }),
    type: z.enum(['MOTOR', 'PUMP', 'COMPRESSOR', 'FAN', 'OTHER']),
    description: z.string().optional(),
    installedAt: z.string().optional(),
    expectedLifespanMonths: z.number().optional(),
  });
}
type AssetForm = z.infer<ReturnType<typeof buildFormSchema>>;

interface Props {
  currentRow?: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssetsActionDialog({ currentRow, open, onOpenChange }: Props) {
  const { t } = useTranslation('assets');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!currentRow;
  const formSchema = useMemo(() => buildFormSchema(t), [t]);
  const assetTypes = useMemo(() => getAssetTypes(t), [t]);
  const createAsset = useCreateAssetMutation();
  const updateAsset = useUpdateAssetMutation();
  const isSubmitting = createAsset.isPending || updateAsset.isPending;

  const form = useForm<AssetForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          name: currentRow.name,
          type: currentRow.type,
          description: currentRow.description ?? '',
          installedAt: currentRow.installedAt ? currentRow.installedAt.slice(0, 10) : '',
          expectedLifespanMonths: currentRow.expectedLifespanMonths ?? undefined,
        }
      : {
          name: '',
          type: 'MOTOR',
          description: '',
          installedAt: '',
          expectedLifespanMonths: undefined,
        },
  });

  const onSubmit = async (values: AssetForm) => {
    try {
      const data = {
        ...values,
        installedAt: values.installedAt ? new Date(values.installedAt).toISOString() : null,
      };

      if (isEdit && currentRow) {
        await updateAsset.mutateAsync({ id: currentRow.id, data });
        toast.success(t('actionDialog.updated'));
      } else {
        await createAsset.mutateAsync(data);
        toast.success(t('actionDialog.created'));
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // The backend returns business failures as HTTP 200 with a non-zero
      // `error` code, so they surface here as a thrown Error rather than an
      // AxiosError the global mutation error handler can parse.
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
          <form id="asset-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-0.5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{tCommon('words.name')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Input placeholder="Motor băng tải 01" {...field} />
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
                    items={assetTypes.map(({ label, value }) => ({ label, value }))}
                  />
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="installedAt"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{t('actionDialog.installedAt')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expectedLifespanMonths"
              render={({ field }) => (
                <FormItem className="grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
                  <FormLabel className="col-span-2 text-right">{t('actionDialog.expectedLifespanMonths')}</FormLabel>
                  <FormControl className="col-span-4">
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 col-start-3" />
                </FormItem>
              )}
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
          </form>
        </Form>
        <DialogFooter>
          <Button type="submit" form="asset-form" disabled={isSubmitting}>
            {tCommon('actions.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
