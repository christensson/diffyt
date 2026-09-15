import {memo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';

import type {Version} from './versions';
import {type Filter, type LoadStatus, authorName, formatTimestamp, versionLabel} from './selection';

const FILTERS: ReadonlyArray<{key: Filter; label: string}> = [
  {key: 'all', label: 'All'},
  {key: 'Summary', label: 'Summary'},
  {key: 'Description', label: 'Description'},
  {key: 'fields', label: 'Fields'}
];

const SAME_KIND_HINT = 'Only versions of the same field can be compared';

interface VersionRowProps {
  version: Version;
  selected: boolean;
  disabled: boolean;
  locale: string | undefined;
  onSelectSingle(id: string): void;
  onToggle(id: string): void;
}

const VersionRow = memo(({version, selected, disabled, locale, onSelectSingle, onToggle}: VersionRowProps) => {
  const label = versionLabel(version);
  const handleToggle = useCallback(() => onToggle(version.id), [onToggle, version.id]);
  const handleSelect = useCallback(() => onSelectSingle(version.id), [onSelectSingle, version.id]);

  const checkbox = (
    <Checkbox
      checked={selected}
      disabled={disabled}
      onChange={handleToggle}
      aria-label={`Include ${label.toLowerCase()} v${version.number} in the comparison`}
    />
  );

  return (
    <li className={`version-row${selected ? ' version-row--selected' : ''}`}>
      <span className="version-row__check">
        {disabled ? <Tooltip title={SAME_KIND_HINT}>{checkbox}</Tooltip> : checkbox}
      </span>
      <button type="button" className="version-row__body" onClick={handleSelect}>
        <span className="version-row__kind">{label}</span>
        <span className="version-row__meta">
          <span className="version-row__number">{`v${version.number}`}</span>
          {version.timestamp !== null && (
            <span className="version-row__date">{formatTimestamp(version.timestamp, locale)}</span>
          )}
        </span>
        {version.author !== null && <span className="version-row__author">{authorName(version.author)}</span>}
      </button>
    </li>
  );
});
VersionRow.displayName = 'VersionRow';

interface VersionListProps {
  /** Versions after applying the filter, newest first. */
  versions: Version[];
  totalCount: number;
  status: LoadStatus;
  errorMessage?: string;
  selectedIds: string[];
  /** Kind of the first selected version; other kinds cannot join the selection. */
  lockedKind: string | null;
  filter: Filter;
  locale: string | undefined;
  onFilterChange(filter: Filter): void;
  onSelectSingle(id: string): void;
  onToggle(id: string): void;
  onCollapse(): void;
}

const VersionListComponent = ({
  versions,
  totalCount,
  status,
  errorMessage,
  selectedIds,
  lockedKind,
  filter,
  locale,
  onFilterChange,
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
      return (
        <div className="version-list__state">
          <Text info>{totalCount === 0 ? 'No summary, description or field changes yet.' : 'No versions match this filter.'}</Text>
        </div>
      );
    }
    return (
      <ul className="version-list__items">
        {versions.map(version => {
          const selected = selectedIds.includes(version.id);
          return (
            <VersionRow
              key={version.id}
              version={version}
              selected={selected}
              disabled={!selected && lockedKind !== null && version.kind !== lockedKind}
              locale={locale}
              onSelectSingle={onSelectSingle}
              onToggle={onToggle}
            />
          );
        })}
      </ul>
    );
  };

  return (
    <aside className="version-list">
      <header className="version-list__header">
        <div className="version-list__title">
          <Text bold>{'Versions'}</Text>
          {status === 'ready' && <Text info>{` (${totalCount})`}</Text>}
        </div>
        <Button icon={chevronLeftIcon} title="Hide version list" aria-label="Hide version list" onClick={onCollapse}/>
      </header>

      <ButtonGroup className="version-list__filters">
        {FILTERS.map(({key, label}) => (
          <Button key={key} active={filter === key} onClick={() => onFilterChange(key)}>{label}</Button>
        ))}
      </ButtonGroup>

      <Text info size={Text.Size.S} className="version-list__hint">
        {'Click a version to see what changed in it. Tick two versions of the same field to compare them.'}
      </Text>

      {renderBody()}
    </aside>
  );
};

export const VersionList = memo(VersionListComponent);
