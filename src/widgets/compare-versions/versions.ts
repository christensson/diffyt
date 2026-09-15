import type {ActivityAuthor, ActivityItem, FieldActivityItem, FieldInfo, IssueSnapshot, OldestRemoved} from './api';
import {type FieldItemValue, formatFieldText, isMultiValueType, stateAfter, stateBefore, toList} from './field-values';

export type TextKind = 'Summary' | 'Description';
export const TEXT_KINDS: readonly TextKind[] = ['Summary', 'Description'];

/** Custom fields get one version stream each, keyed `field:<CustomField id>`. */
export const FIELD_KIND_PREFIX = 'field:';
export const isFieldKind = (kind: string): boolean => kind.startsWith(FIELD_KIND_PREFIX);

/** One state of a field: the content after a change, or the content before the oldest change (v1). */
export interface Version {
  /** Activity id, or `initial-<kind>` for the synthetic first version. */
  id: string;
  /** `Summary`, `Description`, or `field:<id>`; two versions can only be compared within one kind. */
  kind: string;
  /** Display name: the text field name or the custom field presentation. */
  label: string;
  /** 1-based per kind. */
  number: number;
  timestamp: number | null;
  author: ActivityAuthor | null;
  text: string;
  isInitial: boolean;
}

export type OldestRemovedByKind = Record<TextKind, OldestRemoved | null>;

/** Date and author for the synthetic first version. */
export interface VersionMeta {
  created: number;
  reporter: ActivityAuthor | null;
}

interface VersionSeed {
  id: string;
  timestamp: number | null;
  author: ActivityAuthor | null;
  text: string;
}

export const kindOfItem = (item: ActivityItem): TextKind =>
  (item.category.id === 'SummaryCategory' ? 'Summary' : 'Description');

/**
 * Numbers the seeds (ascending) and prepends a synthetic v1 holding `before` when it has content.
 * Without content before the oldest change, the oldest change is itself v1.
 */
const assemble = (kind: string, label: string, before: string, seeds: VersionSeed[], meta: VersionMeta | null): Version[] => {
  const versions: Version[] = [];
  if (before !== '') {
    versions.push({
      id: `initial-${kind}`,
      kind,
      label,
      number: 1,
      timestamp: meta?.created ?? null,
      author: meta?.reporter ?? null,
      text: before,
      isInitial: true
    });
  }
  for (const seed of seeds) {
    versions.push({...seed, kind, label, number: versions.length + 1, isInitial: versions.length === 0});
  }
  return versions;
};

const buildTextVersions = (
  kind: TextKind,
  items: ActivityItem[],
  oldestRemoved: OldestRemoved | null,
  meta: VersionMeta | null
): Version[] => {
  const ascending = items.filter(item => kindOfItem(item) === kind).sort((a, b) => a.timestamp - b.timestamp);
  if (ascending.length === 0) {
    return [];
  }
  // Only trust the separately fetched `removed` if it belongs to the same oldest item.
  const before = oldestRemoved !== null && oldestRemoved.id === ascending[0].id ? oldestRemoved.removed ?? '' : '';
  const seeds = ascending.map(item => ({id: item.id, timestamp: item.timestamp, author: item.author, text: item.added ?? ''}));
  return assemble(kind, kind, before, seeds, meta);
};

interface FieldStates {
  before: FieldItemValue[];
  /** State after each item, aligned with the ascending item list. */
  after: FieldItemValue[][];
}

/**
 * Reconstructs the field states. With the current value known, walk backwards (exact, also for
 * multi-value fields whose items only carry the changed values). Otherwise walk forwards from the
 * oldest item's `removed`.
 */
const buildFieldStates = (
  ascending: FieldActivityItem[],
  current: FieldItemValue[] | null,
  isMulti: boolean
): FieldStates => {
  if (current !== null) {
    const after: FieldItemValue[][] = new Array<FieldItemValue[]>(ascending.length);
    let state = current;
    for (let index = ascending.length - 1; index >= 0; index--) {
      after[index] = state;
      const item = ascending[index];
      state = isMulti ? stateBefore(state, item.added, item.removed) : toList(item.removed);
    }
    return {before: state, after};
  }

  const before = toList(ascending[0].removed);
  let state = before;
  const after = ascending.map(item => {
    state = isMulti ? stateAfter(state, item.added, item.removed) : toList(item.added);
    return state;
  });
  return {before, after};
};

const fieldKey = (field: FieldInfo): string => field.customField?.id ?? field.id;

const buildOneFieldVersions = (
  key: string,
  group: FieldActivityItem[],
  snapshot: IssueSnapshot | null,
  locale: string | undefined
): Version[] => {
  const ascending = [...group].sort((a, b) => a.timestamp - b.timestamp);
  const field = ascending[0].field as FieldInfo;
  const fieldType = field.customField?.fieldType ?? null;
  const isMulti = isMultiValueType(fieldType);
  const typeId = fieldType?.id ?? '';
  const label = field.presentation || field.name || key;

  const current = snapshot ? toList(snapshot.fields[key]) : null;
  const {before, after} = buildFieldStates(ascending, current, isMulti);
  const format = (values: FieldItemValue[]) => formatFieldText(label, values, isMulti, typeId, locale);

  const seeds = ascending.map((item, index) => ({
    id: item.id,
    timestamp: item.timestamp,
    author: item.author,
    text: format(after[index])
  }));
  return assemble(`${FIELD_KIND_PREFIX}${key}`, label, before.length === 0 ? '' : format(before), seeds, snapshot);
};

const buildFieldVersions = (items: FieldActivityItem[], snapshot: IssueSnapshot | null, locale: string | undefined): Version[] => {
  const groups = new Map<string, FieldActivityItem[]>();
  for (const item of items) {
    if (item.field) {
      const key = fieldKey(item.field);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
  }
  return [...groups.entries()].flatMap(([key, group]) => buildOneFieldVersions(key, group, snapshot, locale));
};

const sortKey = (version: Version): number => version.timestamp ?? Number.NEGATIVE_INFINITY;

const byNewestFirst = (a: Version, b: Version): number => {
  const keyA = sortKey(a);
  const keyB = sortKey(b);
  if (keyA === keyB) {
    return 0;
  }
  return keyB > keyA ? 1 : -1;
};

/** Builds all version streams (Summary, Description, one per custom field) and merges them newest first. */
export function buildVersions(
  textItems: ActivityItem[],
  fieldItems: FieldActivityItem[],
  oldestRemoved: OldestRemovedByKind,
  snapshot: IssueSnapshot | null,
  locale: string | undefined
): Version[] {
  const textVersions = TEXT_KINDS.flatMap(kind => buildTextVersions(kind, textItems, oldestRemoved[kind], snapshot));
  return [...textVersions, ...buildFieldVersions(fieldItems, snapshot, locale)].sort(byNewestFirst);
}
