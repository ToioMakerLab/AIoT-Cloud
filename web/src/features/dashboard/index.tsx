import { IconCheck, IconCopy, IconDeviceFloppy, IconFileExport, IconFileImport, IconPlus } from '@tabler/icons-react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LanguageSwitch } from '@/components/language-switch';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { NotificationsNav } from '@/components/notifications-nav';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIsGuest } from '@/hooks/use-is-guest';
import { useIsMobile } from '@/hooks/use-mobile';
import { downloadFile } from '@/lib/download';
import { getTimeRangeOptions, resolveTimeRange, type TimeRangePreset } from '@/lib/time-range';
import { useCreateDashboardMutation, useDashboardDevicesQuery, useDashboardsQuery, useUpdateDashboardMutation } from './api/queries';
import type { IDashboard, IDashboardWidget } from './api/types';
import { AddPanelDialog } from './components/add-panel-dialog';
import { DashboardGrid } from './components/dashboard-grid';
import { DashboardMobile } from './components/dashboard-mobile';
import { useDeviceSocket } from './hooks/use-device-socket';
import { buildDashboardConfigExport, parseDashboardConfigImport } from './lib/dashboard-config';

const NEW_DASHBOARD_VALUE = '__new__';

interface DraftDashboard {
  id: string | null;
  name: string;
  isDefault: boolean;
  widgets: IDashboardWidget[];
}

const blankDraft = (name: string): DraftDashboard => ({
  id: null,
  name,
  isDefault: false,
  widgets: [],
});

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const dashboardsQuery = useDashboardsQuery();
  const devicesQuery = useDashboardDevicesQuery();
  const createDashboard = useCreateDashboardMutation();
  const updateDashboard = useUpdateDashboardMutation();

  const [draft, setDraft] = useState<DraftDashboard>(() => blankDraft(t('newDashboard')));
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [hasSelectedInitial, setHasSelectedInitial] = useState(false);
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('24h');
  const isGuest = useIsGuest();
  const isMobile = useIsMobile();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [jsonCopied, setJsonCopied] = useState(false);

  const dashboards = useMemo(() => dashboardsQuery.data ?? [], [dashboardsQuery.data]);
  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  // Fixed at selection time rather than sliding with "now" every render — see @/lib/time-range.
  const timeRange = useMemo(() => resolveTimeRange(timeRangePreset), [timeRangePreset]);
  const timeRangeOptions = useMemo(() => getTimeRangeOptions(tCommon), [tCommon]);

  // Once the saved dashboards load, default to the first one (if any) instead of a blank draft.
  useEffect(() => {
    if (!hasSelectedInitial && dashboards.length > 0) {
      const first = dashboards[0];
      setDraft({
        id: first.id,
        name: first.name,
        isDefault: first.isDefault,
        widgets: first.widgets,
      });
      setHasSelectedInitial(true);
    }
  }, [dashboards, hasSelectedInitial]);

  // All panel types (CHART, ACTION, VALUE) stream over the same WebSocket connection — CHART used
  // to read from a separate SSE feed, but that path sat behind reverse-proxy/CDN response
  // buffering in production and never delivered realtime pushes, while the WebSocket path (used by
  // ACTION/VALUE) already worked reliably. See use-device-socket.ts.
  const deviceIds = useMemo(() => Array.from(new Set(draft.widgets.map((w) => w.deviceId))), [draft.widgets]);
  const socket = useDeviceSocket(deviceIds);

  const handleSelectDashboard = (value: string) => {
    setHasSelectedInitial(true);
    if (value === NEW_DASHBOARD_VALUE) {
      setDraft(blankDraft(t('newDashboard')));
      return;
    }
    const selected = dashboards.find((d: IDashboard) => d.id === value);
    if (selected) {
      setDraft({
        id: selected.id,
        name: selected.name,
        isDefault: selected.isDefault,
        widgets: selected.widgets,
      });
    }
  };

  const handleAddWidget = (widget: IDashboardWidget) => {
    setDraft((prev) => ({ ...prev, widgets: [...prev.widgets, widget] }));
  };

  const handleRemoveWidget = (widgetId: string) => {
    setDraft((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== widgetId),
    }));
  };

  const handleLayoutChange = (widgets: IDashboardWidget[]) => {
    setDraft((prev) => ({ ...prev, widgets }));
  };

  const nextSlot = useMemo(() => {
    const maxY = draft.widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    return { x: 0, y: maxY };
  }, [draft.widgets]);

  const isSaving = createDashboard.isPending || updateDashboard.isPending;

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    const payload = {
      name: draft.name.trim(),
      isDefault: draft.isDefault,
      widgets: draft.widgets,
    };
    try {
      if (draft.id) {
        const saved = await updateDashboard.mutateAsync({
          id: draft.id,
          data: payload,
        });
        setDraft({
          id: saved.id,
          name: saved.name,
          isDefault: saved.isDefault,
          widgets: saved.widgets,
        });
      } else {
        const saved = await createDashboard.mutateAsync(payload);
        setDraft({
          id: saved.id,
          name: saved.name,
          isDefault: saved.isDefault,
          widgets: saved.widgets,
        });
      }
      toast.success(t('dashboardSaved'));
    } catch {
      // Error toast is already shown by the global mutation error handler.
    }
  };

  const handleExport = () => {
    const config = buildDashboardConfigExport(draft, devices);
    const filename = `${draft.name.trim() || t('newDashboard')}.dashboard.json`;
    downloadFile(JSON.stringify(config, null, 2), filename, 'application/json');
  };

  const handleCopyJson = async () => {
    const config = buildDashboardConfigExport(draft, devices);
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setJsonCopied(true);
      toast.success(t('copyJsonSuccess'));
      setTimeout(() => setJsonCopied(false), 2000);
    } catch {
      toast.error(t('copyJsonFailed'));
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  // Imported config always lands as a new, unsaved draft (id: null) rather than overwriting
  // whatever dashboard is currently selected — the user reviews it and clicks Save explicitly.
  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const parsed = parseDashboardConfigImport(raw, devices);
      setDraft({ id: null, name: parsed.name, isDefault: false, widgets: parsed.widgets });
      setHasSelectedInitial(true);
      if (parsed.skippedCount > 0) {
        toast.warning(t('import.partialSuccess', { count: parsed.skippedCount }));
      } else {
        toast.success(t('import.success'));
      }
    } catch {
      toast.error(t('import.invalidFile'));
    }
  };

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={draft.id ?? NEW_DASHBOARD_VALUE} onValueChange={handleSelectDashboard}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t('selectDashboard')} />
            </SelectTrigger>
            <SelectContent>
              {dashboards.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_DASHBOARD_VALUE}>+ {t('newDashboard')}</SelectItem>
            </SelectContent>
          </Select>

          <Input
            className="w-full sm:w-56"
            value={draft.name}
            disabled={isGuest}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={t('dashboardNamePlaceholder')}
          />

          <div className="flex items-center gap-2">
            <Switch
              id="dashboard-is-default"
              checked={draft.isDefault}
              disabled={isGuest}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isDefault: checked }))}
            />
            <label htmlFor="dashboard-is-default" className="text-muted-foreground text-sm">
              {t('default')}
            </label>
          </div>

          {/* Bounds the REST-fetched history CHART/VALUE panels seed from; live telemetry keeps
              streaming on top regardless of what's picked here — see @/lib/time-range. */}
          <Select value={timeRangePreset} onValueChange={(value) => setTimeRangePreset(value as TimeRangePreset)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder={tCommon('timeRange.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {timeRangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {!isGuest && (
              <>
                <Button variant="outline" className="flex-1 sm:flex-initial" onClick={handleExport}>
                  <IconFileExport className="h-4 w-4" />
                  {t('export')}
                </Button>
                {/* <Button variant="outline" className="flex-1 sm:flex-initial" onClick={() => void handleCopyJson()}>
                {jsonCopied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                {t('copyJson')}
                </Button> */}
                <Button variant="outline" className="flex-1 sm:flex-initial" onClick={handleImportClick}>
                  <IconFileImport className="h-4 w-4" />
                  {t('importButton')}
                </Button>
                <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFileChange} />
                <Button variant="outline" className="flex-1 sm:flex-initial" onClick={() => setAddPanelOpen(true)}>
                  <IconPlus className="h-4 w-4" />
                  {t('addPanelButton')}
                </Button>
                <Button className="flex-1 sm:flex-initial" onClick={handleSave} disabled={isSaving}>
                  <IconDeviceFloppy className="h-4 w-4" />
                  {isSaving ? t('saving') : t('save')}
                </Button>
              </>
            )}
          </div>
        </div>

        {isMobile ? (
          <DashboardMobile widgets={draft.widgets} devices={devices} liveData={socket} timeRange={timeRange} onRemoveWidget={handleRemoveWidget} />
        ) : (
          <DashboardGrid
            widgets={draft.widgets}
            devices={devices}
            liveData={socket}
            timeRange={timeRange}
            onLayoutChange={handleLayoutChange}
            onRemoveWidget={handleRemoveWidget}
          />
        )}
      </Main>

      <AddPanelDialog open={addPanelOpen} onOpenChange={setAddPanelOpen} devices={devices} nextSlot={nextSlot} onAdd={handleAddWidget} />
    </>
  );
}
