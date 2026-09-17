import {memo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';

import type {Part, Version} from './versions';
import {type DateFormat, formatDateTime} from './date-format';
import {type LoadStatus, authorName} from './selection';

interface VersionRowProps {
  version: Version;
  selected: boolean;
  dateFormat: DateFormat;
  onSelectSingle(id: string): void;
  onToggle(id: string): void;
}

/**
 * Two lines: `Summary, Priority v6`, then `16 Sep 2026 20:49 · Ada Lovelace`. Label and author
 * truncate with an ellipsis and carry the full text as a tooltip.
 */
const VersionRow = memo(({version, selected, dateFormat, onSelectSingle, onToggle}: VersionRowProps) => {
  const handleToggle = useCallback(() => onToggle(version.id), [onToggle, version.id]);
  const handleSelect = useCallback(() => onSelectSingle(version.id), [onSelectSingle, version.id]);
  const author = version.author !== null ? authorName(version.author) : null;

  return (
    <li className={`version-row${selected ? ' version-row--selected' : ''}`}>
      <span className="version-row__check">
        <Checkbox
          checked={selected}
          onChange={handleToggle}
          aria-label={`Include v${version.number} in the comparison`}
        />
      </span>
      <button type="button" className="version-row__body" onClick={handleSelect}>
        <span className="version-row__title">
          <span className="version-row__kind" title={version.label}>{version.label}</span>
          <span className="version-row__number">{`v${version.number}`}</span>
        </span>
        <span className="version-row__meta">
          {version.timestamp !== null && (
            <span className="version-row__date">{formatDateTime(version.timestamp, dateFormat)}</span>
          )}
          {version.timestamp !== null && author !== null && <span className="version-row__separator">{'·'}</span>}
          {author !== null && <span className="version-row__author" title={author}>{author}</span>}
        </span>
      </button>
    </li>
  );
});
VersionRow.displayName = 'VersionRow';

interface VersionListProps {
  /** Versions that changed the selected part (plus v1), newest first. */
  versions: Version[];
  status: LoadStatus;
  errorMessage?: string;
  selectedIds: string[];
  /** Available parts; the tab row is hidden when there is only one. */
  parts: readonly Part[];
  part: Part;
  dateFormat: DateFormat;
  onPartChange(part: Part): void;
  onSelectSingle(id: string): void;
  onToggle(id: string): void;
  onCollapse(): void;
}

const VersionListComponent = ({
  versions,
  status,
  errorMessage,
  selectedIds,
  parts,
  part,
  dateFormat,
  onPartChange,
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
    if (versions.length === 0) {
      return <div className="version-list__state"><Text info>{'No changes recorded yet.'}</Text></div>;
    }
    return (
      <ul className="version-list__items">
        {versions.map(version => (
          <VersionRow
            key={version.id}
            version={version}
            selected={selectedIds.includes(version.id)}
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
          {status === 'ready' && <Text info>{` (${versions.length})`}</Text>}
        </div>
        <Button icon={chevronLeftIcon} title="Hide version list" aria-label="Hide version list" onClick={onCollapse}/>
      </header>

      {parts.length > 1 && (
        <ButtonGroup className="version-list__filters">
          {parts.map(candidate => (
            <Button key={candidate} active={part === candidate} onClick={() => onPartChange(candidate)}>{candidate}</Button>
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
