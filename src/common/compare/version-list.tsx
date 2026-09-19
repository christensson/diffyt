import React, {memo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';

import type {Part} from './versions';
import {type DateFormat, formatDateTime} from './date-format';
import {type View, type VersionRow, isRowDisabled} from './rows';
import {type LoadStatus, authorName} from './selection';

interface VersionRowProps {
  row: VersionRow;
  selected: boolean;
  /** The row's kind cannot join the current selection; only the checkbox is disabled. */
  disabled: boolean;
  /** Show the row's part as a tag (All view). */
  showPart: boolean;
  dateFormat: DateFormat;
  onSelectSingle(key: string): void;
  onToggle(key: string): void;
}

/**
 * Two lines: `Summary, Priority  CONTENT  v6` (the part tag only in the All view), then
 * `16 Sep 2026 20:49 · Ada Lovelace`. Label and author truncate with an ellipsis and carry the full
 * text as a tooltip.
 */
const VersionRowComponent = ({row, selected, disabled, showPart, dateFormat, onSelectSingle, onToggle}: VersionRowProps) => {
  const {version} = row;
  const handleToggle = useCallback(() => onToggle(row.key), [onToggle, row.key]);
  const handleSelect = useCallback(() => onSelectSingle(row.key), [onSelectSingle, row.key]);
  const author = version.author !== null ? authorName(version.author) : null;
  // Second line: `date · author`.
  const meta: {key: string; node: React.ReactNode}[] = [];
  if (version.timestamp !== null) {
    meta.push({key: 'date', node: <span className="version-row__date">{formatDateTime(version.timestamp, dateFormat)}</span>});
  }
  if (author !== null) {
    meta.push({key: 'author', node: <span className="version-row__author" title={author}>{author}</span>});
  }

  return (
    <li className={`version-row${selected ? ' version-row--selected' : ''}${version.isInitial ? ' version-row--initial' : ''}`}>
      <span className="version-row__check">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onChange={handleToggle}
          aria-label={`Include v${version.number}${row.part ? ` (${row.part})` : ''} in the comparison`}
        />
      </span>
      <button type="button" className="version-row__body" onClick={handleSelect}>
        <span className="version-row__title">
          <span className="version-row__kind" title={row.label}>{row.label}</span>
          {showPart && row.part !== null && <span className="version-row__part">{row.part}</span>}
          <span className="version-row__number">{`v${version.number}`}</span>
        </span>
        <span className="version-row__meta">
          {meta.map((item, index) => (
            <React.Fragment key={item.key}>
              {index > 0 && <span className="version-row__separator">{'·'}</span>}
              {item.node}
            </React.Fragment>
          ))}
        </span>
      </button>
    </li>
  );
};
const VersionRowView = memo(VersionRowComponent);

interface VersionListProps {
  /** Rows of the current view, newest first. */
  rows: VersionRow[];
  /** Distinct versions behind the rows (a split save counts once). */
  versionCount: number;
  status: LoadStatus;
  errorMessage?: string;
  selectedKeys: string[];
  /** The part the selection is committed to; rows of the other part get a disabled checkbox. */
  selectedPart: Part | null;
  /** Available views; the tab row is hidden when there is only one. */
  views: readonly View[];
  view: View;
  dateFormat: DateFormat;
  onViewChange(view: View): void;
  onSelectSingle(key: string): void;
  onToggle(key: string): void;
  onCollapse(): void;
}

const VersionListComponent = ({
  rows,
  versionCount,
  status,
  errorMessage,
  selectedKeys,
  selectedPart,
  views,
  view,
  dateFormat,
  onViewChange,
  onSelectSingle,
  onToggle,
  onCollapse
}: VersionListProps) => {
  const renderBody = () => {
    if (status === 'loading') {
      return <div className="version-list__state"><LoaderInline/> <Text info>{'Loading versions…'}</Text></div>;
    }
    if (status === 'error') {
      return <div className="version-list__state version-list__state--error">{errorMessage ?? 'Failed to load versions'}</div>;
    }
    if (rows.length === 0) {
      return <div className="version-list__state"><Text info>{'No changes recorded yet.'}</Text></div>;
    }
    return (
      <ul className="version-list__items">
        {rows.map(row => (
          <VersionRowView
            key={row.key}
            row={row}
            selected={selectedKeys.includes(row.key)}
            disabled={isRowDisabled(row, selectedPart)}
            showPart={view === 'All'}
            dateFormat={dateFormat}
            onSelectSingle={onSelectSingle}
            onToggle={onToggle}
          />
        ))}
      </ul>
    );
  };

  return (
    <aside className="version-list">
      <header className="version-list__header">
        <div className="version-list__title">
          <Text bold>{'Versions'}</Text>
          {status === 'ready' && <Text info>{` (${versionCount})`}</Text>}
        </div>
        <Button icon={chevronLeftIcon} title="Hide version list" aria-label="Hide version list" onClick={onCollapse}/>
      </header>

      {views.length > 1 && (
        <ButtonGroup className="version-list__filters">
          {views.map(candidate => (
            <Button key={candidate} active={view === candidate} onClick={() => onViewChange(candidate)}>{candidate}</Button>
          ))}
        </ButtonGroup>
      )}

      <Text info size={Text.Size.S} className="version-list__hint">
        {'Click a version to see its change; tick two to compare them.'}
      </Text>

      {renderBody()}
    </aside>
  );
};

export const VersionList = memo(VersionListComponent);
