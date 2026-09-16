import {memo, useCallback, useEffect, useRef, useState} from 'react';
import Select, {type SelectItem, Type as SelectType} from '@jetbrains/ring-ui-built/components/select/select';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';

import type {HostAPI} from '../../../@types/globals';
import {type EntityRef, fetchByReadableId, searchEntities} from './api';
import type {EntityAdapter} from './entity';
import {createComponentLogger} from '@/common/utils/logger';
import {buildSearchPlan} from './search-queries';

const logger = createComponentLogger('entity-search');

const DEBOUNCE_MS = 300;

type EntityItem = SelectItem<{entity: EntityRef}>;

const toItem = (entity: EntityRef): EntityItem => ({
  key: entity.id,
  label: entity.idReadable,
  description: entity.summary,
  details: entity.project ?? undefined,
  entity
});

interface EntitySearchProps {
  host: HostAPI;
  adapter: EntityAdapter;
  currentId: string;
  /** Called with the picked entity, or null when the field is cleared. */
  onSelect(entity: EntityRef | null): void;
}

/**
 * Server-side entity search. The component owns the Select's `selected` state: Ring UI resets the
 * typed text to the selected label whenever `selected` or `data` change, so the selection is dropped
 * as soon as the user types something else. The parent keeps showing the last comparison meanwhile.
 */
const EntitySearchComponent = ({host, adapter, currentId, onSelect}: EntitySearchProps) => {
  const [items, setItems] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EntityItem | null>(null);
  // Mirrors selectedItem synchronously: the Select echoes the picked label via onFilter in the same tick.
  const selectedLabel = useRef<string | null>(null);
  const requestId = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const runSearch = useCallback(async (text: string) => {
    requestId.current += 1;
    const id = requestId.current;
    const isCurrent = () => id === requestId.current;

    const plan = buildSearchPlan(text, adapter);
    if (plan.directId === null && plan.queries.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let results: EntityRef[] = [];
      const direct = plan.directId === null ? null : await fetchByReadableId(host, adapter, plan.directId);
      if (direct && direct.id !== currentId) {
        results = [direct];
      }
      for (const query of plan.queries) {
        if (results.length > 0) {
          break;
        }
        results = await searchEntities(host, adapter, query, currentId);
      }
      if (isCurrent()) {
        setItems(results.map(toItem));
      }
    } catch (error) {
      logger.error('Search failed', {text}, error);
      if (isCurrent()) {
        setItems([]);
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [host, adapter, currentId]);

  const handleFilter = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    // After a pick the Select echoes the chosen label as filter text; no need to search for it again.
    if (selectedLabel.current !== null && text.trim() === selectedLabel.current) {
      return;
    }
    if (selectedLabel.current !== null) {
      selectedLabel.current = null;
      setSelectedItem(null);
    }
    timer.current = window.setTimeout(() => {
      runSearch(text);
    }, DEBOUNCE_MS);
  }, [runSearch]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleChange = useCallback((item: EntityItem | null) => {
    // The Select echoes the picked label through onFilter just before onChange; drop that pending search.
    window.clearTimeout(timer.current);
    selectedLabel.current = item ? String(item.label) : null;
    setSelectedItem(item);
    onSelect(item?.entity ?? null);
  }, [onSelect]);

  return (
    <Select<{entity: EntityRef}>
      type={SelectType.INPUT}
      size={Size.FULL}
      className="compare-header__search"
      data={items}
      selected={selectedItem}
      filter={{fn: () => true}}
      onFilter={handleFilter}
      onChange={handleChange}
      loading={loading}
      loadingMessage="Searching…"
      notFoundMessage={`No matching ${adapter.noun}s`}
      label=""
      inputPlaceholder={`Search ${adapter.noun} by ID or ${adapter.summaryNoun}`}
      clear
    />
  );
};

export const EntitySearch = memo(EntitySearchComponent);
