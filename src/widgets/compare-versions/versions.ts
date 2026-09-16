import type {ActivityAuthor, ActivityItem, FieldActivityItem, FieldInfo, IssueSnapshot, OldestRemoved} from '@/common/compare/api';
import {type FieldItemValue, isMultiValueType, stateAfter, stateBefore, toList} from '@/common/compare/field-values';
import {
  type CatalogueEntry,
  entryFromSnapshotField,
  mergeCatalogue,
  renderContent,
  renderFieldLines
} from '@/common/compare/issue-state';

/** The two views of a version; the list is filtered to versions that changed the selected part. */
export type Part = 'Content' | 'Fields';
export const PARTS: readonly Part[] = ['Content', 'Fields'];

export type TextKind = 'Summary' | 'Description';

/** The complete issue state after one save (all activity items sharing a timestamp), or at creation (v1). */
export interface Version {
  /** First activity id of the group, or `initial` for the creation state. */
  id: string;
  /** 1-based position in the timeline; global, so a version keeps its number in every part. */
  number: number;
  timestamp: number | null;
  author: ActivityAuthor | null;
  isInitial: boolean;
  changedParts: ReadonlySet<Part>;
  /** "Created" for v1, otherwise the changed names, e.g. "Summary, Priority". */
  label: string;
  summary: string;
  description: string;
  /** Summary on the first line, then a blank line, `Description:`, and the description. */
  contentText: string;
  /** YAML-style document of every custom field in project order. */
  fieldsText: string;
}

export type OldestRemovedByKind = Record<TextKind, OldestRemoved | null>;

export const kindOfItem = (item: ActivityItem): TextKind =>
  (item.category.id === 'SummaryCategory' ? 'Summary' : 'Description');

export const textFor = (version: Version, part: Part): string =>
  (part === 'Content' ? version.contentText : version.fieldsText);


/** Versions relevant for a part: those that changed it, plus the creation state. */
export const versionsFor = (versions: Version[], part: Part): Version[] =>
  versions.filter(version => version.isInitial || version.changedParts.has(part));

interface FieldTimeline {
  initial: FieldItemValue[];
  /** Values of the field after each of its activity items. */
  afterById: Map<string, FieldItemValue[]>;
}

const byTimestampAsc = <T extends {timestamp: number}>(a: T, b: T): number => a.timestamp - b.timestamp;

const fieldKey = (field: FieldInfo): string => field.customField?.id ?? field.id;

const hasField = (item: FieldActivityItem): item is FieldActivityItem & {field: FieldInfo} => item.field !== null;

/** All custom fields to show: the issue's current fields in project order, then fields only seen in history. */
const buildCatalogue = (snapshot: IssueSnapshot | null, fieldItems: FieldActivityItem[]): CatalogueEntry[] => {
  const base = (snapshot?.fields ?? []).map(entryFromSnapshotField);
  const fromHistory = fieldItems.filter(hasField).map(item => {
    const fieldType = item.field.customField?.fieldType ?? null;
    return {
      id: fieldKey(item.field),
      label: item.field.presentation || item.field.name || fieldKey(item.field),
      isMulti: isMultiValueType(fieldType),
      typeId: fieldType?.id ?? ''
    };
  });
  return mergeCatalogue(base, fromHistory);
};

interface FieldStates {
  before: FieldItemValue[];
  /** State after each item, aligned with the ascending item list. */
  after: FieldItemValue[][];
}

/**
 * Reconstructs one field's states. With the current value known, walk backwards (exact, also for
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

const buildFieldTimelines = (
  catalogue: CatalogueEntry[],
  fieldItems: FieldActivityItem[],
  snapshot: IssueSnapshot | null
): Map<string, FieldTimeline> => {
  const itemsByField = new Map<string, FieldActivityItem[]>();
  for (const item of fieldItems.filter(hasField)) {
    const id = fieldKey(item.field);
    itemsByField.set(id, [...(itemsByField.get(id) ?? []), item]);
  }
  const currentById = new Map((snapshot?.fields ?? []).map(field => [field.id, toList(field.value)]));

  return new Map(catalogue.map(entry => {
    const items = [...(itemsByField.get(entry.id) ?? [])].sort(byTimestampAsc);
    // With a snapshot, a field missing from it no longer exists on the issue, i.e. it is empty now.
    const current = snapshot ? currentById.get(entry.id) ?? [] : null;
    if (items.length === 0) {
      return [entry.id, {initial: current ?? [], afterById: new Map()}];
    }
    const {before, after} = buildFieldStates(items, current, entry.isMulti);
    return [entry.id, {initial: before, afterById: new Map(items.map((item, index) => [item.id, after[index]]))}];
  }));
};

/** Text of Summary/Description at creation: the oldest change's `removed`, or the current text if never changed. */
const initialText = (
  kind: TextKind,
  textItems: ActivityItem[],
  oldestRemoved: OldestRemovedByKind,
  snapshot: IssueSnapshot | null
): string => {
  const items = textItems.filter(item => kindOfItem(item) === kind).sort(byTimestampAsc);
  if (items.length === 0) {
    return (kind === 'Summary' ? snapshot?.summary : snapshot?.description) ?? '';
  }
  const oldest = oldestRemoved[kind];
  // Only trust the separately fetched `removed` if it belongs to the same oldest item.
  return oldest !== null && oldest.id === items[0].id ? oldest.removed ?? '' : '';
};

type Event = {kind: 'text'; item: ActivityItem} | {kind: 'field'; item: FieldActivityItem & {field: FieldInfo}};

/** Consecutive events with the same timestamp were saved together and form one version. */
const groupByTimestamp = (events: Event[]): Event[][] => {
  const groups: Event[][] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last[0].item.timestamp === event.item.timestamp) {
      last.push(event);
    } else {
      groups.push([event]);
    }
  }
  return groups;
};

interface IssueState {
  summary: string;
  description: string;
  fields: Map<string, FieldItemValue[]>;
}

const pushUnique = (list: string[], value: string): void => {
  if (!list.includes(value)) {
    list.push(value);
  }
};

/**
 * Builds the timeline of complete issue states, newest first. v1 is the state at creation; every
 * later version is the state after one save (all activity items sharing a timestamp).
 */
export function buildVersions(
  textItems: ActivityItem[],
  fieldItems: FieldActivityItem[],
  oldestRemoved: OldestRemovedByKind,
  snapshot: IssueSnapshot | null,
  locale: string | undefined
): Version[] {
  const catalogue = buildCatalogue(snapshot, fieldItems);
  const timelines = buildFieldTimelines(catalogue, fieldItems, snapshot);
  const labelById = new Map(catalogue.map(entry => [entry.id, entry.label]));

  const state: IssueState = {
    summary: initialText('Summary', textItems, oldestRemoved, snapshot),
    description: initialText('Description', textItems, oldestRemoved, snapshot),
    fields: new Map([...timelines].map(([id, timeline]) => [id, timeline.initial]))
  };

  const versions: Version[] = [{
    id: 'initial',
    number: 1,
    timestamp: snapshot?.created ?? null,
    author: snapshot?.reporter ?? null,
    isInitial: true,
    changedParts: new Set(PARTS),
    label: 'Created',
    summary: state.summary,
    description: state.description,
    contentText: renderContent(state.summary, state.description),
    fieldsText: renderFieldLines(state.fields, catalogue, locale)
  }];

  const events: Event[] = [
    ...textItems.map((item): Event => ({kind: 'text', item})),
    ...fieldItems.filter(hasField).map((item): Event => ({kind: 'field', item}))
  ].sort((a, b) => byTimestampAsc(a.item, b.item));

  for (const group of groupByTimestamp(events)) {
    const changedParts = new Set<Part>();
    const labels: string[] = [];
    for (const event of group) {
      if (event.kind === 'text') {
        const kind = kindOfItem(event.item);
        state[kind === 'Summary' ? 'summary' : 'description'] = event.item.added ?? '';
        changedParts.add('Content');
        pushUnique(labels, kind);
      } else {
        const id = fieldKey(event.item.field);
        const after = timelines.get(id)?.afterById.get(event.item.id);
        if (after) {
          state.fields.set(id, after);
        }
        changedParts.add('Fields');
        pushUnique(labels, labelById.get(id) ?? event.item.field.presentation);
      }
    }
    const first = group[0].item;
    versions.push({
      id: first.id,
      number: versions.length + 1,
      timestamp: first.timestamp,
      author: first.author,
      isInitial: false,
      changedParts,
      label: labels.join(', '),
      summary: state.summary,
      description: state.description,
      contentText: renderContent(state.summary, state.description),
      fieldsText: renderFieldLines(state.fields, catalogue, locale)
    });
  }

  return versions.reverse();
}
