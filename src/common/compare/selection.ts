import type {ActivityAuthor} from './api';
import {type DateFormat, formatDateTime} from './date-format';
import type {DiffModel} from './types';
import {type VersionRow, findRow, selectedPart} from './rows';
import {type Part, type Version, textFor, versionsFor} from './versions';

export type {DiffModel, LoadStatus, ViewOptions} from './types';

/** At most two versions can be selected: one shows its change, two show the diff between them. */
export const MAX_SELECTED = 2;

export const authorName = (author: ActivityAuthor | null): string =>
  author?.fullName || author?.name || author?.login || 'Unknown';

/** "v3 · 14 Sep 2026 17:05 · Ada Lovelace" (date/author omitted when unknown). */
export const describeVersion = (version: Version, dateFormat: DateFormat): string => {
  const parts = [`v${version.number}`];
  if (version.timestamp !== null) {
    parts.push(formatDateTime(version.timestamp, dateFormat));
  }
  if (version.author !== null) {
    parts.push(authorName(version.author));
  }
  return parts.join(' · ');
};

/**
 * Toggles `id` in the selection, keeping at most MAX_SELECTED versions.
 * The first pick is the baseline and stays; a third pick replaces the second one.
 */
export function toggleSelection(selectedIds: string[], id: string): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter(selected => selected !== id);
  }
  return selectedIds.length >= MAX_SELECTED ? [selectedIds[0], id] : [...selectedIds, id];
}

const diffBetween = (older: Version, newer: Version, part: Part, dateFormat: DateFormat): DiffModel => ({
  mode: 'diff',
  part,
  label: part,
  oldText: textFor(older, part),
  newText: textFor(newer, part),
  leftTitle: describeVersion(older, dateFormat),
  rightTitle: describeVersion(newer, dateFormat)
});

/**
 * One selected row: the diff of its part against the previous version that changed that part (or the
 * plain text for the creation state). Two selected rows: the diff between their versions, oldest on the
 * left. The part is the one the selection is committed to; an Initial-only selection uses `defaultPart`.
 */
export function deriveDiff(
  versions: Version[],
  rows: VersionRow[],
  selectedKeys: string[],
  defaultPart: Part,
  dateFormat: DateFormat
): DiffModel | null {
  const selected = selectedKeys
    .map(key => findRow(rows, key))
    .filter((row): row is VersionRow => row !== undefined)
    .map(row => row.version);

  if (selected.length === 0) {
    return null;
  }
  const part = selectedPart(rows, selectedKeys) ?? defaultPart;

  if (selected.length === 1) {
    const [version] = selected;
    // Versions that changed the part, newest first: the predecessor is the first one older than `version`.
    const predecessor = versionsFor(versions, part).find(other => other.number < version.number);
    if (!predecessor) {
      return {mode: 'initial', part, label: part, text: textFor(version, part), title: describeVersion(version, dateFormat)};
    }
    return diffBetween(predecessor, version, part, dateFormat);
  }

  const [older, newer] = [...selected].sort((a, b) => a.number - b.number);
  return diffBetween(older, newer, part, dateFormat);
}
