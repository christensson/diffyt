import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';

import type {HostAPI} from '../../../@types/globals';
import {createComponentLogger} from '@/common/utils/logger';
import {fetchFieldActivities, fetchOldestRemoved, fetchSnapshot, fetchTextActivities} from './api';
import type {DateFormat} from './date-format';
import type {EntityAdapter} from './entity';
import {contentMarkers} from './issue-state';
import {type Version, buildVersions} from './versions';
import {type View, type VersionRow, isRowDisabled, rowsFor, selectedPart, viewsFor} from './rows';
import {type LoadStatus, type ViewOptions, deriveDiff, toggleSelection} from './selection';
import {useDarkTheme} from './use-dark-theme';
import {VersionList} from './version-list';
import {DiffPane} from './diff-pane';
import './base.css';
import './versions-app.css';

const logger = createComponentLogger('versions-app');

const DEFAULT_VIEW_OPTIONS: ViewOptions = {splitView: true, wordDiff: true, showDiffOnly: false};

const newestKey = (rows: VersionRow[]): string[] => (rows.length > 0 ? [rows[0].key] : []);

/** Auxiliary requests only enrich the list; a failure is logged and replaced by a fallback value. */
const warnAnd = <T,>(what: string, entityId: string, fallback: T) => (error: unknown): T => {
  logger.warn(`Failed to load ${what}`, {entityId}, error);
  return fallback;
};

export interface VersionsAppProps {
  host: HostAPI;
  adapter: EntityAdapter;
  entityId: string | undefined;
  dateFormat: DateFormat;
}

/** Timeline of complete entity states with a per-part diff (issues: All | Content | Fields, articles: Content). */
const VersionsAppComponent = ({host, adapter, entityId, dateFormat}: VersionsAppProps) => {
  const views = viewsFor(adapter);
  const [versions, setVersions] = useState<Version[]>([]);
  const [textLabels, setTextLabels] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [view, setView] = useState<View>(views[0]);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dark = useDarkTheme();

  useEffect(() => {
    if (!entityId) {
      setErrorMessage(`This widget must be opened from an ${adapter.noun}.`);
      setStatus('error');
      return undefined;
    }

    let cancelled = false;
    Promise.all([
      fetchTextActivities(host, adapter, entityId),
      fetchFieldActivities(host, adapter, entityId).catch(warnAnd('field changes', entityId, [])),
      fetchOldestRemoved(host, adapter, entityId, 'Body').catch(warnAnd(`initial ${adapter.bodyLabel.toLowerCase()}`, entityId, null)),
      fetchOldestRemoved(host, adapter, entityId, 'Summary').catch(warnAnd('initial summary', entityId, null)),
      fetchSnapshot(host, adapter, entityId).catch(warnAnd(`${adapter.noun} snapshot`, entityId, null))
    ])
      .then(([textItems, fieldItems, oldestBody, oldestSummary, snapshot]) => {
        if (cancelled) {
          return;
        }
        const timeline = buildVersions(adapter, textItems, fieldItems, {Body: oldestBody, Summary: oldestSummary}, snapshot, dateFormat);
        setVersions(timeline.versions);
        setTextLabels(timeline.textLabels);
        // Preselect the newest row of the opening view so the dialog never opens empty.
        setSelectedKeys(newestKey(rowsFor(timeline.versions, views[0])));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logger.error('Failed to load activities', {entityId}, error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load versions');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // `views` derives from `adapter`, so it is not a separate dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, adapter, entityId, dateFormat]);

  const rows = useMemo(() => rowsFor(versions, view), [versions, view]);
  const committedPart = useMemo(() => selectedPart(rows, selectedKeys), [rows, selectedKeys]);
  const diff = useMemo(
    () => deriveDiff(versions, rows, selectedKeys, view === 'All' ? 'Content' : view, dateFormat),
    [versions, rows, selectedKeys, view, dateFormat]
  );

  const handleSelectSingle = useCallback((key: string) => setSelectedKeys([key]), []);
  const handleToggle = useCallback(
    (key: string) => setSelectedKeys(previous => {
      const row = rows.find(candidate => candidate.key === key);
      // Guard against a stale click on a row of the other kind.
      return row && isRowDisabled(row, selectedPart(rows, previous)) ? previous : toggleSelection(previous, key);
    }),
    [rows]
  );
  const handleViewChange = useCallback(
    (next: View) => {
      setView(next);
      setSelectedKeys(newestKey(rowsFor(versions, next)));
    },
    [versions]
  );
  const handleViewOptionsChange = useCallback(
    (patch: Partial<ViewOptions>) => setViewOptions(previous => ({...previous, ...patch})),
    []
  );
  const collapseSidebar = useCallback(() => setSidebarCollapsed(true), []);
  const expandSidebar = useCallback(() => setSidebarCollapsed(false), []);

  return (
    <ThemeProvider
      theme={dark ? Theme.DARK : Theme.LIGHT}
      className={`app${sidebarCollapsed ? ' app--collapsed' : ''}`}
    >
      {!sidebarCollapsed && (
        <VersionList
          rows={rows}
          versionCount={versions.length}
          status={status}
          errorMessage={errorMessage}
          selectedKeys={selectedKeys}
          selectedPart={committedPart}
          views={views}
          view={view}
          dateFormat={dateFormat}
          onViewChange={handleViewChange}
          onSelectSingle={handleSelectSingle}
          onToggle={handleToggle}
          onCollapse={collapseSidebar}
        />
      )}
      <DiffPane
        diff={diff}
        status={status}
        viewOptions={viewOptions}
        sidebarCollapsed={sidebarCollapsed}
        dark={dark}
        yaml={diff?.part === 'Fields'}
        sectionMarkers={diff?.part === 'Content' ? contentMarkers(adapter, textLabels) : undefined}
        onViewOptionsChange={handleViewOptionsChange}
        onExpandSidebar={expandSidebar}
      />
    </ThemeProvider>
  );
};

export const VersionsApp = memo(VersionsAppComponent);
