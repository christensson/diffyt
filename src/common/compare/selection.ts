import type {ActivityAuthor} from './api';
import type {DiffModel} from './types';
import {type Part, type Version, textFor} from './versions';

export type {DiffModel, LoadStatus, ViewOptions} from './types';

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

/** "v3 · Sep 14, 2026, 5:05 PM · Ada Lovelace" (date/author omitted when unknown). */
export const describeVersion = (version: Version, locale: string | undefined): string => {
  const parts = [`v${version.number}`];
  if (version.timestamp !== null) {
    parts.push(formatTimestamp(version.timestamp, locale));
  }
  if (version.author !== null) {
    parts.push(authorName(version.author));
  }
  return parts.join(' · ');
};

const findById = (versions: Version[], id: string): Version | undefined =>
  versions.find(version => version.id === id);

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

const diffBetween = (older: Version, newer: Version, part: Part, locale: string | undefined): DiffModel => ({
  mode: 'diff',
  label: part,
  oldText: textFor(older, part),
  newText: textFor(newer, part),
  leftTitle: describeVersion(older, locale),
  rightTitle: describeVersion(newer, locale)
});

/**
 * One selected version: the diff of the part against the previous listed version (or its plain text
 * for the creation state). Two selected versions: the diff of the part between them, oldest on the left.
 * `visibleVersions` is the list shown for `part`, newest first.
 */
export function deriveDiff(
  visibleVersions: Version[],
  selectedIds: string[],
  part: Part,
  locale: string | undefined
): DiffModel | null {
  const selected = selectedIds
    .map(id => findById(visibleVersions, id))
    .filter((version): version is Version => version !== undefined);

  if (selected.length === 0) {
    return null;
  }

  if (selected.length === 1) {
    const [version] = selected;
    const predecessor = visibleVersions.find(other => other.number < version.number);
    if (!predecessor) {
      return {mode: 'initial', label: part, text: textFor(version, part), title: describeVersion(version, locale)};
    }
    return diffBetween(predecessor, version, part, locale);
  }

  const [older, newer] = [...selected].sort((a, b) => a.number - b.number);
  return diffBetween(older, newer, part, locale);
}
