import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {createComponentLogger} from '@/common/utils/logger';
import {type IssueRef, type IssueSnapshot, fetchIssueRef, fetchIssueSnapshot} from '@/common/compare/api';
import {buildCatalogue, renderContent, renderFieldsFor} from '@/common/compare/issue-state';
import type {DiffModel, ViewOptions} from '@/common/compare/types';
import {useDarkTheme} from '@/common/compare/use-dark-theme';
import {DiffPane} from '@/common/compare/diff-pane';
import {IssueSearch} from './issue-search';

const host = await YTApp.register();
const logger = createComponentLogger('compare-issues');
const issueId = YTApp.entity?.id;
const locale = YTApp.locale;

type Mode = 'Content' | 'Fields';
const MODES: readonly Mode[] = ['Content', 'Fields'];
const DEFAULT_VIEW_OPTIONS: ViewOptions = {splitView: true, wordDiff: true, showDiffOnly: false};

interface LoadedIssue {
  ref: IssueRef;
  snapshot: IssueSnapshot;
}

type OtherStatus = 'idle' | 'loading' | 'ready' | 'error';

const loadIssue = async (id: string): Promise<LoadedIssue> => {
  const [ref, snapshot] = await Promise.all([fetchIssueRef(host, id), fetchIssueSnapshot(host, id)]);
  return {ref, snapshot};
};

const titleOf = (issue: LoadedIssue): string => `${issue.ref.idReadable} · ${issue.ref.summary}`;

const buildDiff = (mode: Mode, current: LoadedIssue, other: LoadedIssue): DiffModel => {
  const titles = {leftTitle: titleOf(current), rightTitle: titleOf(other)};
  if (mode === 'Content') {
    return {
      mode: 'diff',
      label: mode,
      oldText: renderContent(current.snapshot.summary, current.snapshot.description),
      newText: renderContent(other.snapshot.summary, other.snapshot.description),
      ...titles
    };
  }
  const catalogue = buildCatalogue([current.snapshot, other.snapshot]);
  return {
    mode: 'diff',
    label: mode,
    oldText: renderFieldsFor(current.snapshot, catalogue, locale),
    newText: renderFieldsFor(other.snapshot, catalogue, locale),
    ...titles
  };
};

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const noop = () => undefined;

const AppComponent: React.FunctionComponent = () => {
  const [current, setCurrent] = useState<LoadedIssue | null>(null);
  const [currentError, setCurrentError] = useState<string>();
  const [selected, setSelected] = useState<IssueRef | null>(null);
  const [other, setOther] = useState<LoadedIssue | null>(null);
  const [otherStatus, setOtherStatus] = useState<OtherStatus>('idle');
  const [otherError, setOtherError] = useState<string>();
  const [mode, setMode] = useState<Mode>('Content');
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const dark = useDarkTheme();
  const requestId = useRef(0);

  useEffect(() => {
    if (!issueId) {
      setCurrentError('This widget must be opened from an issue.');
      return undefined;
    }
    let cancelled = false;
    loadIssue(issueId)
      .then(loaded => {
        if (!cancelled) {
          setCurrent(loaded);
        }
      })
      .catch((error: unknown) => {
        logger.error('Failed to load the current issue', {issueId}, error);
        if (!cancelled) {
          setCurrentError(errorText(error, 'Failed to load this issue'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = useCallback((issue: IssueRef | null) => {
    requestId.current += 1;
    const id = requestId.current;
    setSelected(issue);
    if (!issue) {
      setOther(null);
      setOtherStatus('idle');
      return;
    }
    setOtherStatus('loading');
    loadIssue(issue.id)
      .then(loaded => {
        if (id === requestId.current) {
          setOther(loaded);
          setOtherStatus('ready');
        }
      })
      .catch((error: unknown) => {
        logger.error('Failed to load the other issue', {issueId: issue.id}, error);
        if (id === requestId.current) {
          setOtherError(errorText(error, 'Failed to load the selected issue'));
          setOtherStatus('error');
        }
      });
  }, []);

  const handleViewOptionsChange = useCallback(
    (patch: Partial<ViewOptions>) => setViewOptions(previous => ({...previous, ...patch})),
    []
  );

  const diff = useMemo(
    () => (current && other && otherStatus === 'ready' ? buildDiff(mode, current, other) : null),
    [mode, current, other, otherStatus]
  );

  const renderBody = () => {
    if (currentError) {
      return <div className="compare-state compare-state--error">{currentError}</div>;
    }
    if (!current) {
      return <div className="compare-state"><LoaderInline/> <Text info>{'Loading this issue…'}</Text></div>;
    }
    if (otherStatus === 'loading') {
      return <div className="compare-state"><LoaderInline/> <Text info>{`Loading ${selected?.idReadable ?? 'issue'}…`}</Text></div>;
    }
    if (otherStatus === 'error') {
      return <div className="compare-state compare-state--error">{otherError ?? 'Failed to load the selected issue'}</div>;
    }
    return (
      <DiffPane
        diff={diff}
        status="ready"
        viewOptions={viewOptions}
        sidebarCollapsed={false}
        dark={dark}
        yaml={mode === 'Fields'}
        emptyMessage={`Search for an issue by ID or summary to compare with ${current.ref.idReadable}.`}
        onViewOptionsChange={handleViewOptionsChange}
        onExpandSidebar={noop}
      />
    );
  };

  return (
    <ThemeProvider theme={dark ? Theme.DARK : Theme.LIGHT} className="app">
      <header className="compare-header">
        <Text bold className="compare-header__current" title={current ? titleOf(current) : undefined}>
          {current ? current.ref.idReadable : 'This issue'}
        </Text>
        <Text info>{'vs'}</Text>
        {issueId && <IssueSearch host={host} currentIssueId={issueId} onSelect={handleSelect}/>}
        <ButtonGroup className="compare-header__modes">
          {MODES.map(candidate => (
            <Button key={candidate} active={mode === candidate} onClick={() => setMode(candidate)}>{candidate}</Button>
          ))}
        </ButtonGroup>
      </header>
      <div className="compare-body">
        {renderBody()}
      </div>
    </ThemeProvider>
  );
};

export const App = memo(AppComponent);
