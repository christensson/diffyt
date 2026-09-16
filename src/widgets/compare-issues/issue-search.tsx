import {memo, useCallback, useEffect, useRef, useState} from 'react';
import Select, {type SelectItem, Type as SelectType} from '@jetbrains/ring-ui-built/components/select/select';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';

import type {HostAPI} from '../../../@types/globals';
import {type IssueRef, searchIssues} from '@/common/compare/api';
import {createComponentLogger} from '@/common/utils/logger';
import {buildQueries} from './search-queries';

const logger = createComponentLogger('issue-search');

const DEBOUNCE_MS = 300;

type IssueItem = SelectItem<{issue: IssueRef}>;

const toItem = (issue: IssueRef): IssueItem => ({
  key: issue.id,
  label: issue.idReadable,
  description: issue.summary,
  details: issue.project ?? undefined,
  issue
});

interface IssueSearchProps {
  host: HostAPI;
  currentIssueId: string;
  /** Called with the picked issue, or null when the field is cleared. */
  onSelect(issue: IssueRef | null): void;
}

/**
 * Server-side issue search. The component owns the Select's `selected` state: Ring UI resets the
 * typed text to the selected label whenever `selected` or `data` change, so the selection is dropped
 * as soon as the user types something else. The parent keeps showing the last comparison meanwhile.
 */
const IssueSearchComponent = ({host, currentIssueId, onSelect}: IssueSearchProps) => {
  const [items, setItems] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<IssueItem | null>(null);
  // Mirrors selectedItem synchronously: the Select echoes the picked label via onFilter in the same tick.
  const selectedLabel = useRef<string | null>(null);
  const requestId = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const runSearch = useCallback(async (text: string) => {
    requestId.current += 1;
    const id = requestId.current;
    const isCurrent = () => id === requestId.current;

    const queries = buildQueries(text);
    if (queries.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let results: IssueRef[] = [];
      for (const query of queries) {
        results = await searchIssues(host, query, currentIssueId);
        if (results.length > 0) {
          break;
        }
      }
      if (isCurrent()) {
        setItems(results.map(toItem));
      }
    } catch (error) {
      logger.error('Issue search failed', {text}, error);
      if (isCurrent()) {
        setItems([]);
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [host, currentIssueId]);

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

  const handleChange = useCallback((item: IssueItem | null) => {
    // The Select echoes the picked label through onFilter just before onChange; drop that pending search.
    window.clearTimeout(timer.current);
    selectedLabel.current = item ? String(item.label) : null;
    setSelectedItem(item);
    onSelect(item?.issue ?? null);
  }, [onSelect]);

  return (
    <Select<{issue: IssueRef}>
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
      notFoundMessage="No matching issues"
      label=""
      inputPlaceholder="Search issue by ID or summary"
      clear
    />
  );
};

export const IssueSearch = memo(IssueSearchComponent);
