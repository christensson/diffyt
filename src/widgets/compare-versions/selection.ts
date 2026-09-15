import type {ActivityAuthor} from './api';
import {type Version, isFieldKind} from './versions';

export type Filter = 'all' | 'Summary' | 'Description' | 'fields';
export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ViewOptions {
  splitView: boolean;
  wordDiff: boolean;
  showDiffOnly: boolean;
}

export type DiffModel =
  | {mode: 'diff'; kind: string; label: string; oldText: string; newText: string; leftTitle: string; rightTitle: string}
  | {mode: 'initial'; kind: string; label: string; text: string; title: string};

/** At most two versions can be selected: one shows its change, two show the diff between them. */
export const MAX_SELECTED = 2;

export const authorName = (author: ActivityAuthor | null): string =>
  author?.fullName || author?.name || author?.login || 'Unknown';

const toBcp47 = (locale: string | undefined): string | undefined => locale?.replace(/_/g, '-');

export const formatTimestamp = (timestamp: number, locale: string | undefined): string => {
  const options: Intl.DateTimeFormatOptions = {dateStyle: 'medium', timeStyle: 'short'};
  try {
    return new Intl.DateTimeFormat(toBcp47(locale), options).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(timestamp);
  }
};

export const versionLabel = (version: Version): string => version.label;

/** "Description · v1 · Sep 8, 2026, 2:00 PM · Linus Torvalds" (date/author omitted when unknown). */
export const describeVersion = (version: Version, locale: string | undefined): string => {
  const parts = [versionLabel(version), `v${version.number}`];
  if (version.timestamp !== null) {
    parts.push(formatTimestamp(version.timestamp, locale));
  }
  if (version.author !== null) {
    parts.push(authorName(version.author));
  }
  return parts.join(' · ');
};

export const filterItems = (versions: Version[], filter: Filter): Version[] => {
  if (filter === 'all') {
    return versions;
  }
  if (filter === 'fields') {
    return versions.filter(version => isFieldKind(version.kind));
  }
  return versions.filter(version => version.kind === filter);
};

const findById = (versions: Version[], id: string): Version | undefined =>
  versions.find(version => version.id === id);

/** Kind of the first selected version; other kinds cannot be added to the selection. */
export const lockedKind = (versions: Version[], selectedIds: string[]): string | null => {
  const first = selectedIds.length > 0 ? findById(versions, selectedIds[0]) : undefined;
  return first ? first.kind : null;
};

/**
 * Toggles `id` in the selection. Keeps at most MAX_SELECTED versions of the same kind.
 * The first pick is the baseline and stays; a third pick replaces the second one.
 */
export function toggleSelection(selectedIds: string[], id: string, versions: Version[]): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter(selected => selected !== id);
  }

  const target = findById(versions, id);
  if (!target) {
    return selectedIds;
  }

  const sameKind = selectedIds.filter(selected => findById(versions, selected)?.kind === target.kind);
  return sameKind.length >= MAX_SELECTED ? [sameKind[0], id] : [...sameKind, id];
}

const predecessorOf = (versions: Version[], version: Version): Version | undefined =>
  versions
    .filter(other => other.kind === version.kind && other.number < version.number)
    .sort((a, b) => b.number - a.number)[0];

const diffBetween = (older: Version, newer: Version, locale: string | undefined): DiffModel => ({
  mode: 'diff',
  kind: newer.kind,
  label: newer.label,
  oldText: older.text,
  newText: newer.text,
  leftTitle: describeVersion(older, locale),
  rightTitle: describeVersion(newer, locale)
});

/**
 * One selected version: the diff against its predecessor (or its plain text for the initial version).
 * Two selected versions: the diff between them, oldest on the left.
 */
export function deriveDiff(
  versions: Version[],
  selectedIds: string[],
  locale: string | undefined
): DiffModel | null {
  const selected = selectedIds
    .map(id => findById(versions, id))
    .filter((version): version is Version => version !== undefined);

  if (selected.length === 0) {
    return null;
  }

  if (selected.length === 1) {
    const [version] = selected;
    const predecessor = predecessorOf(versions, version);
    if (!predecessor) {
      return {mode: 'initial', kind: version.kind, label: version.label, text: version.text, title: describeVersion(version, locale)};
    }
    return diffBetween(predecessor, version, locale);
  }

  const [older, newer] = [...selected].sort((a, b) => a.number - b.number);
  return diffBetween(older, newer, locale);
}
