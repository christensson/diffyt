import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';

import type {HostAPI} from '../../../@types/globals';
import {createComponentLogger} from '@/common/utils/logger';
import {fetchFieldActivities, fetchOldestRemoved, fetchSnapshot, fetchTextActivities} from './api';
import type {DateFormat} from './date-format';
import type {EntityAdapter} from './entity';
import {contentMarkers} from './issue-state';
import {type Part, type Version, buildVersions, partsFor, versionsFor} from './versions';
import {type LoadStatus, type ViewOptions, deriveDiff, toggleSelection} from './selection';
import {useDarkTheme} from './use-dark-theme';
import {VersionList} from './version-list';
import {DiffPane} from './diff-pane';
import './base.css';
import './versions-app.css';

const logger = createComponentLogger('versions-app');

const DEFAULT_VIEW_OPTIONS: ViewOptions = {splitView: true, wordDiff: true, showDiffOnly: false};

const newestId = (versions: Version[]): string[] => (versions.length > 0 ? [versions[0].id] : []);

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

/** Timeline of complete entity states with a per-part diff (issues: Content | Fields, articles: Content). */
const VersionsAppComponent = ({host, adapter, entityId, dateFormat}: VersionsAppProps) => {
  const parts = partsFor(adapter);
  const [versions, setVersions] = useState<Version[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [part, setPart] = useState<Part>('Content');
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
        const result = buildVersions(adapter, textItems, fieldItems, {Body: oldestBody, Summary: oldestSummary}, snapshot, dateFormat);
        setVersions(result);
        // Preselect the newest version of the default part so the dialog never opens empty.
        setSelectedIds(newestId(versionsFor(result, 'Content')));
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
  }, [host, adapter, entityId, dateFormat]);

  const visibleVersions = useMemo(() => versionsFor(versions, part), [versions, part]);
  const diff = useMemo(() => deriveDiff(visibleVersions, selectedIds, part, dateFormat), [visibleVersions, selectedIds, part, dateFormat]);

  const handleSelectSingle = useCallback((id: string) => setSelectedIds([id]), []);
  const handleToggle = useCallback((id: string) => setSelectedIds(previous => toggleSelection(previous, id)), []);
  const handlePartChange = useCallback(
    (next: Part) => {
      setPart(next);
      setSelectedIds(newestId(versionsFor(versions, next)));
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
          versions={visibleVersions}
          status={status}
          errorMessage={errorMessage}
          selectedIds={selectedIds}
          parts={parts}
          part={part}
          dateFormat={dateFormat}
          onPartChange={handlePartChange}
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
        yaml={part === 'Fields'}
        sectionMarkers={part === 'Content' ? contentMarkers(adapter) : undefined}
        onViewOptionsChange={handleViewOptionsChange}
        onExpandSidebar={expandSidebar}
      />
    </ThemeProvider>
  );
};

export const VersionsApp = memo(VersionsAppComponent);
