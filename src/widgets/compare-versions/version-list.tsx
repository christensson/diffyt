import {memo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';

import {type Part, type Version, PARTS} from './versions';
import {type LoadStatus, authorName, formatTimestamp} from './selection';

interface VersionRowProps {
  version: Version;
  selected: boolean;
  locale: string | undefined;
  onSelectSingle(id: string): void;
  onToggle(id: string): void;
}

const VersionRow = memo(({version, selected, locale, onSelectSingle, onToggle}: VersionRowProps) => {
  const handleToggle = useCallback(() => onToggle(version.id), [onToggle, version.id]);
  const handleSelect = useCallback(() => onSelectSingle(version.id), [onSelectSingle, version.id]);

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
        <span className="version-row__kind" title={version.label}>{version.label}</span>
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
  /** Versions that changed the selected part (plus v1), newest first. */
  versions: Version[];
  status: LoadStatus;
  errorMessage?: string;
  selectedIds: string[];
  part: Part;
  locale: string | undefined;
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
  part,
  locale,
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
            locale={locale}
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

      <ButtonGroup className="version-list__filters">
        {PARTS.map(candidate => (
          <Button key={candidate} active={part === candidate} onClick={() => onPartChange(candidate)}>{candidate}</Button>
        ))}
      </ButtonGroup>

      <Text info size={Text.Size.S} className="version-list__hint">
        {'Click a version to see what changed in it. Tick two versions to compare them.'}
      </Text>

      {renderBody()}
    </aside>
  );
};

export const VersionList = memo(VersionListComponent);
