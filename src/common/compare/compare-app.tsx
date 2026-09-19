import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import type {HostAPI} from '../../../@types/globals';
import {createComponentLogger} from '@/common/utils/logger';
import {type EntityRef, type EntitySnapshot, fetchRef, fetchSnapshot} from './api';
import type {DateFormat} from './date-format';
import type {EntityAdapter} from './entity';
import {type CatalogueEntry, buildCatalogue, contentMarkers, renderContentFor, renderFieldsFor, textLabels} from './issue-state';
import type {DiffModel, ViewOptions} from './types';
import {type Part, partsFor} from './versions';
import {useDarkTheme} from './use-dark-theme';
import {DiffPane} from './diff-pane';
import {EntitySearch} from './entity-search';
import './base.css';
import './compare-app.css';

const logger = createComponentLogger('compare-app');

const DEFAULT_VIEW_OPTIONS: ViewOptions = {splitView: true, wordDiff: true, showDiffOnly: false};

interface LoadedEntity {
  ref: EntityRef;
  snapshot: EntitySnapshot;
}

type OtherStatus = 'idle' | 'loading' | 'ready' | 'error';

const loadEntity = async (host: HostAPI, adapter: EntityAdapter, id: string): Promise<LoadedEntity> => {
  const [ref, snapshot] = await Promise.all([fetchRef(host, adapter, id), fetchSnapshot(host, adapter, id)]);
  return {ref, snapshot};
};

const titleOf = (entity: LoadedEntity): string => `${entity.ref.idReadable} · ${entity.ref.summary}`;

const buildDiff = (
  mode: Part,
  adapter: EntityAdapter,
  current: LoadedEntity,
  other: LoadedEntity,
  catalogue: CatalogueEntry[],
  dateFormat: DateFormat
): DiffModel => {
  const titles = {leftTitle: titleOf(current), rightTitle: titleOf(other)};
  if (mode === 'Content') {
    return {
      mode: 'diff',
      label: mode,
      oldText: renderContentFor(current.snapshot, catalogue, adapter),
      newText: renderContentFor(other.snapshot, catalogue, adapter),
      ...titles
    };
  }
  return {
    mode: 'diff',
    label: mode,
    oldText: renderFieldsFor(current.snapshot, catalogue, dateFormat),
    newText: renderFieldsFor(other.snapshot, catalogue, dateFormat),
    ...titles
  };
};

interface Comparison {
  diff: DiffModel;
  /** Heading lines of the Content text: Summary, the body, and both entities' text fields. */
  sectionMarkers: string[];
}

const buildComparison = (
  mode: Part,
  adapter: EntityAdapter,
  current: LoadedEntity,
  other: LoadedEntity,
  dateFormat: DateFormat
): Comparison => {
  // The union of both entities' custom fields, current entity's project order first.
  const catalogue: CatalogueEntry[] = buildCatalogue([current.snapshot, other.snapshot]);
  return {
    diff: buildDiff(mode, adapter, current, other, catalogue, dateFormat),
    sectionMarkers: contentMarkers(adapter, textLabels(catalogue))
  };
};

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const noop = () => undefined;

export interface CompareAppProps {
  host: HostAPI;
  adapter: EntityAdapter;
  entityId: string | undefined;
  dateFormat: DateFormat;
}

/** Diffs the current entity against another one picked through a search field. */
const CompareAppComponent = ({host, adapter, entityId, dateFormat}: CompareAppProps) => {
  const modes = partsFor(adapter);
  const [current, setCurrent] = useState<LoadedEntity | null>(null);
  const [currentError, setCurrentError] = useState<string>();
  const [selected, setSelected] = useState<EntityRef | null>(null);
  const [other, setOther] = useState<LoadedEntity | null>(null);
  const [otherStatus, setOtherStatus] = useState<OtherStatus>('idle');
  const [otherError, setOtherError] = useState<string>();
  const [mode, setMode] = useState<Part>('Content');
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const dark = useDarkTheme();
  const requestId = useRef(0);

  useEffect(() => {
    if (!entityId) {
      setCurrentError(`This widget must be opened from an ${adapter.noun}.`);
      return undefined;
    }
    let cancelled = false;
    loadEntity(host, adapter, entityId)
      .then(loaded => {
        if (!cancelled) {
          setCurrent(loaded);
        }
      })
      .catch((error: unknown) => {
        logger.error(`Failed to load the current ${adapter.noun}`, {entityId}, error);
        if (!cancelled) {
          setCurrentError(errorText(error, `Failed to load this ${adapter.noun}`));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, adapter, entityId]);

  const handleSelect = useCallback((entity: EntityRef | null) => {
    requestId.current += 1;
    const id = requestId.current;
    setSelected(entity);
    if (!entity) {
      setOther(null);
      setOtherStatus('idle');
      return;
    }
    setOtherStatus('loading');
    loadEntity(host, adapter, entity.id)
      .then(loaded => {
        if (id === requestId.current) {
          setOther(loaded);
          setOtherStatus('ready');
        }
      })
      .catch((error: unknown) => {
        logger.error(`Failed to load the other ${adapter.noun}`, {entityId: entity.id}, error);
        if (id === requestId.current) {
          setOtherError(errorText(error, `Failed to load the selected ${adapter.noun}`));
          setOtherStatus('error');
        }
      });
  }, [host, adapter]);

  const handleViewOptionsChange = useCallback(
    (patch: Partial<ViewOptions>) => setViewOptions(previous => ({...previous, ...patch})),
    []
  );

  const comparison = useMemo(
    () => (current && other && otherStatus === 'ready' ? buildComparison(mode, adapter, current, other, dateFormat) : null),
    [mode, adapter, current, other, otherStatus, dateFormat]
  );

  const renderBody = () => {
    if (currentError) {
      return <div className="compare-state compare-state--error">{currentError}</div>;
    }
    if (!current) {
      return <div className="compare-state"><LoaderInline/> <Text info>{`Loading this ${adapter.noun}…`}</Text></div>;
    }
    if (otherStatus === 'loading') {
      return <div className="compare-state"><LoaderInline/> <Text info>{`Loading ${selected?.idReadable ?? adapter.noun}…`}</Text></div>;
    }
    if (otherStatus === 'error') {
      return <div className="compare-state compare-state--error">{otherError ?? `Failed to load the selected ${adapter.noun}`}</div>;
    }
    return (
      <DiffPane
        diff={comparison?.diff ?? null}
        status="ready"
        viewOptions={viewOptions}
        sidebarCollapsed={false}
        dark={dark}
        yaml={mode === 'Fields'}
        sectionMarkers={mode === 'Content' ? comparison?.sectionMarkers : undefined}
        emptyMessage={`Search for an ${adapter.noun} by ID or ${adapter.summaryNoun} to compare with ${current.ref.idReadable}.`}
        onViewOptionsChange={handleViewOptionsChange}
        onExpandSidebar={noop}
      />
    );
  };

  return (
    <ThemeProvider theme={dark ? Theme.DARK : Theme.LIGHT} className="app">
      <header className="compare-header">
        <Text bold className="compare-header__current" title={current ? titleOf(current) : undefined}>
          {current ? current.ref.idReadable : `This ${adapter.noun}`}
        </Text>
        <Text info>{'vs'}</Text>
        {entityId && <EntitySearch host={host} adapter={adapter} currentId={entityId} onSelect={handleSelect}/>}
        {modes.length > 1 && (
          <ButtonGroup className="compare-header__modes">
            {modes.map(candidate => (
              <Button key={candidate} active={mode === candidate} onClick={() => setMode(candidate)}>{candidate}</Button>
            ))}
          </ButtonGroup>
        )}
      </header>
      <div className="compare-body">
        {renderBody()}
      </div>
    </ThemeProvider>
  );
};

export const CompareApp = memo(CompareAppComponent);
