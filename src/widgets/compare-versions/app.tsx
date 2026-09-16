import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';

import {createComponentLogger} from '@/common/utils/logger';
import {fetchFieldActivities, fetchIssueSnapshot, fetchOldestRemoved, fetchTextActivities} from '@/common/compare/api';
import {type Part, type Version, buildVersions, versionsFor} from './versions';
import {type LoadStatus, type ViewOptions, deriveDiff, toggleSelection} from './selection';
import {useDarkTheme} from '@/common/compare/use-dark-theme';
import {VersionList} from './version-list';
import {DiffPane} from '@/common/compare/diff-pane';

const host = await YTApp.register();
const logger = createComponentLogger('compare-versions');
const issueId = YTApp.entity?.id;
const locale = YTApp.locale;

const DEFAULT_VIEW_OPTIONS: ViewOptions = {splitView: true, wordDiff: true, showDiffOnly: false};
const DEFAULT_PART: Part = 'Content';

const newestId = (versions: Version[]): string[] => (versions.length > 0 ? [versions[0].id] : []);

/** Auxiliary requests only enrich the list; a failure is logged and replaced by a fallback value. */
const warnAnd = <T,>(what: string, fallback: T) => (error: unknown): T => {
  logger.warn(`Failed to load ${what}`, {issueId}, error);
  return fallback;
};

const AppComponent: React.FunctionComponent = () => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [part, setPart] = useState<Part>(DEFAULT_PART);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dark = useDarkTheme();

  useEffect(() => {
    if (!issueId) {
      setErrorMessage('This widget must be opened from an issue.');
      setStatus('error');
      return undefined;
    }

    let cancelled = false;
    Promise.all([
      fetchTextActivities(host, issueId),
      fetchFieldActivities(host, issueId).catch(warnAnd('field changes', [])),
      fetchOldestRemoved(host, issueId, 'DescriptionCategory').catch(warnAnd('initial description', null)),
      fetchOldestRemoved(host, issueId, 'SummaryCategory').catch(warnAnd('initial summary', null)),
      fetchIssueSnapshot(host, issueId).catch(warnAnd('issue snapshot', null))
    ])
      .then(([textItems, fieldItems, oldestDescription, oldestSummary, snapshot]) => {
        if (cancelled) {
          return;
        }
        const result = buildVersions(
          textItems,
          fieldItems,
          {Description: oldestDescription, Summary: oldestSummary},
          snapshot,
          locale
        );
        setVersions(result);
        // Preselect the newest version of the default part so the dialog never opens empty.
        setSelectedIds(newestId(versionsFor(result, DEFAULT_PART)));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logger.error('Failed to load activities', {issueId}, error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load versions');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleVersions = useMemo(() => versionsFor(versions, part), [versions, part]);
  const diff = useMemo(() => deriveDiff(visibleVersions, selectedIds, part, locale), [visibleVersions, selectedIds, part]);

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
          part={part}
          locale={locale}
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
        onViewOptionsChange={handleViewOptionsChange}
        onExpandSidebar={expandSidebar}
      />
    </ThemeProvider>
  );
};

export const App = memo(AppComponent);
