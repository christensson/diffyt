import type {EntityAdapter} from './entity';

export interface SearchPlan {
  /** Readable id to look up directly first, when the text looks like one. */
  directId: string | null;
  /** Search queries to try in order until one returns results. */
  queries: string[];
}

/**
 * Id-like text: direct lookup, then an id search (issues), then free text. A single word searches
 * summaries first for issues (articles have no summary attribute in the query language) and falls
 * back to free text, which also matches summaries/titles.
 */
export const buildSearchPlan = (text: string, adapter: EntityAdapter): SearchPlan => {
  const trimmed = text.trim();
  if (trimmed === '') {
    return {directId: null, queries: []};
  }
  if (adapter.idPattern.test(trimmed)) {
    const idQuery = adapter.kind === 'issue' ? [`issue id: ${trimmed}`] : [];
    return {directId: trimmed, queries: [...idQuery, trimmed]};
  }
  if (!trimmed.includes(' ') && adapter.kind === 'issue') {
    return {directId: null, queries: [`summary: ${trimmed}`, trimmed]};
  }
  return {directId: null, queries: [trimmed]};
};
