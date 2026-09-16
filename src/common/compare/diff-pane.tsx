import React, {memo, useCallback} from 'react';
import ReactDiffViewer, {DiffMethod} from 'react-diff-viewer-continued';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import Toggle, {Size as ToggleSize} from '@jetbrains/ring-ui-built/components/toggle/toggle';
import chevronRightIcon from '@jetbrains/icons/chevron-right';

import type {DiffModel, LoadStatus, ViewOptions} from './types';
import './diff-pane.css';

/**
 * Map the diff viewer's palette onto Ring UI variables so the colors follow YouTrack's theme.
 * The same set is used for light and dark; Ring UI swaps the variable values per theme.
 */
const ringVariables = {
  diffViewerBackground: 'var(--ring-content-background-color)',
  diffViewerColor: 'var(--ring-text-color)',
  diffViewerTitleBackground: 'var(--ring-sidebar-background-color)',
  diffViewerTitleColor: 'var(--ring-text-color)',
  diffViewerTitleBorderColor: 'var(--ring-line-color)',
  addedBackground: 'var(--ring-added-subtle-background-color)',
  addedColor: 'var(--ring-text-color)',
  removedBackground: 'var(--ring-removed-subtle-background-color)',
  removedColor: 'var(--ring-text-color)',
  changedBackground: 'var(--ring-hover-background-color)',
  wordAddedBackground: 'var(--ring-added-background-color)',
  wordRemovedBackground: 'var(--ring-removed-background-color)',
  addedGutterBackground: 'var(--ring-added-subtle-background-color)',
  removedGutterBackground: 'var(--ring-removed-subtle-background-color)',
  gutterBackground: 'var(--ring-sidebar-background-color)',
  gutterBackgroundDark: 'var(--ring-sidebar-background-color)',
  highlightBackground: 'var(--ring-selected-background-color)',
  highlightGutterBackground: 'var(--ring-selected-background-color)',
  codeFoldGutterBackground: 'var(--ring-sidebar-background-color)',
  codeFoldBackground: 'var(--ring-sidebar-background-color)',
  emptyLineBackground: 'var(--ring-sidebar-background-color)',
  gutterColor: 'var(--ring-secondary-color)',
  addedGutterColor: 'var(--ring-secondary-color)',
  removedGutterColor: 'var(--ring-secondary-color)',
  codeFoldContentColor: 'var(--ring-secondary-color)'
};

const diffStyles = {
  variables: {light: ringVariables, dark: ringVariables},
  // The viewer defaults to a 1000px minimum width; let it shrink so long lines wrap instead of overflowing.
  diffContainer: {minWidth: 0},
  titleBlock: {
    height: 'auto',
    padding: 'calc(var(--ring-unit) / 2) calc(var(--ring-unit) * 2)',
    lineHeight: 'var(--ring-line-height-lower)',
    fontFamily: 'var(--ring-font-family)',
    fontSize: 'var(--ring-font-size-smaller)',
    color: 'var(--ring-secondary-color)',
    pre: {margin: 0, lineHeight: 'inherit', whiteSpace: 'normal', fontFamily: 'inherit'}
  },
  contentText: {
    fontFamily: 'var(--ring-font-family-monospace)',
    fontSize: 'var(--ring-font-size-smaller)',
    lineHeight: 'var(--ring-line-height)'
  },
  lineNumber: {
    fontFamily: 'var(--ring-font-family-monospace)',
    fontSize: 'var(--ring-font-size-smaller)'
  }
};

interface DiffPaneProps {
  diff: DiffModel | null;
  status: LoadStatus;
  viewOptions: ViewOptions;
  sidebarCollapsed: boolean;
  dark: boolean;
  /** Shown when nothing is selected; defaults to the version-list wording. */
  emptyMessage?: string;
  onViewOptionsChange(patch: Partial<ViewOptions>): void;
  onExpandSidebar(): void;
}

const DEFAULT_EMPTY_MESSAGE = 'Select a version on the left to see its change.';

const DiffPaneComponent = ({
  diff,
  status,
  viewOptions,
  sidebarCollapsed,
  dark,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  onViewOptionsChange,
  onExpandSidebar
}: DiffPaneProps) => {
  const toggleSplit = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onViewOptionsChange({splitView: event.target.checked}),
    [onViewOptionsChange]
  );
  const toggleWordDiff = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onViewOptionsChange({wordDiff: event.target.checked}),
    [onViewOptionsChange]
  );
  const toggleDiffOnly = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onViewOptionsChange({showDiffOnly: event.target.checked}),
    [onViewOptionsChange]
  );

  // In inline mode the viewer shows only the left title, so both sides are combined into it.
  const renderBody = () => {
    if (status !== 'ready') {
      return null;
    }
    if (!diff) {
      return <div className="diff-pane__state"><Text info>{emptyMessage}</Text></div>;
    }
    if (diff.mode === 'initial') {
      return (
        <div className="diff-pane__initial">
          <div className="diff-pane__initial-title">{diff.title}</div>
          <Text info size={Text.Size.S}>{'State at creation — nothing earlier to compare with.'}</Text>
          {diff.text === ''
            ? <Text info>{'The field was empty.'}</Text>
            : <pre className="diff-pane__plain">{diff.text}</pre>}
        </div>
      );
    }
    if (diff.oldText === '' && diff.newText === '') {
      return <div className="diff-pane__state"><Text info>{'Both versions are empty.'}</Text></div>;
    }
    return (
      <ReactDiffViewer
        oldValue={diff.oldText}
        newValue={diff.newText}
        splitView={viewOptions.splitView}
        disableWordDiff={!viewOptions.wordDiff}
        compareMethod={DiffMethod.WORDS_WITH_SPACE}
        showDiffOnly={viewOptions.showDiffOnly}
        useDarkTheme={dark}
        leftTitle={viewOptions.splitView ? diff.leftTitle : `${diff.leftTitle}   →   ${diff.rightTitle}`}
        rightTitle={diff.rightTitle}
        styles={diffStyles}
        disableWorker
        hideSummary
      />
    );
  };

  return (
    <section className="diff-pane">
      <header className="diff-pane__toolbar">
        <div className="diff-pane__toolbar-start">
          {sidebarCollapsed && (
            <Button
              icon={chevronRightIcon}
              title="Show version list"
              aria-label="Show version list"
              onClick={onExpandSidebar}
            />
          )}
          {diff && <Text bold>{diff.label}</Text>}
        </div>
        <div className="diff-pane__toolbar-end">
          <Toggle size={ToggleSize.Size14} checked={viewOptions.splitView} onChange={toggleSplit}>{'Side by side'}</Toggle>
          <Toggle size={ToggleSize.Size14} checked={viewOptions.wordDiff} onChange={toggleWordDiff}>{'Word diff'}</Toggle>
          <Toggle size={ToggleSize.Size14} checked={viewOptions.showDiffOnly} onChange={toggleDiffOnly}>{'Only changes'}</Toggle>
        </div>
      </header>
      <div className="diff-pane__body">
        {renderBody()}
      </div>
    </section>
  );
};

export const DiffPane = memo(DiffPaneComponent);
