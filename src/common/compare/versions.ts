import type {ActivityAuthor, ActivityItem, EntitySnapshot, FieldActivityItem, FieldInfo, OldestRemoved} from './api';
import type {EntityAdapter, TextKind} from './entity';
import {type FieldItemValue, isMultiValueType, stateAfter, stateBefore, toList} from './field-values';
import {
  type CatalogueEntry,
  entryFromSnapshotField,
  mergeCatalogue,
  renderContent,
  renderFieldLines
} from './issue-state';

/** The views of a version; the list is filtered to versions that changed the selected part. */
export type Part = 'Content' | 'Fields';

/** Parts available for an entity kind: articles have no custom fields. */
export const partsFor = (adapter: EntityAdapter): readonly Part[] =>
  (adapter.supportsFields ? ['Content', 'Fields'] : ['Content']);

/** The complete entity state after one save (all activity items sharing a timestamp), or at creation (v1). */
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
  body: string;
  /** Summary heading, summary, body heading, body. */
  contentText: string;
  /** YAML-style document of every custom field in project order (empty for articles). */
  fieldsText: string;
}

export type OldestRemovedByKind = Record<TextKind, OldestRemoved | null>;

/** Date and author for the synthetic first version. */
export interface VersionMeta {
  created: number;
  reporter: ActivityAuthor | null;
}

export const kindOfItem = (item: ActivityItem, adapter: EntityAdapter): TextKind =>
  (item.category.id === adapter.summaryCategory ? 'Summary' : 'Body');

const kindLabel = (kind: TextKind, adapter: EntityAdapter): string => (kind === 'Summary' ? 'Summary' : adapter.bodyLabel);

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

/** All custom fields to show: the entity's current fields in project order, then fields only seen in history. */
const buildCatalogue = (snapshot: EntitySnapshot | null, fieldItems: FieldActivityItem[]): CatalogueEntry[] => {
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
  snapshot: EntitySnapshot | null
): Map<string, FieldTimeline> => {
  const itemsByField = new Map<string, FieldActivityItem[]>();
  for (const item of fieldItems.filter(hasField)) {
    const id = fieldKey(item.field);
    itemsByField.set(id, [...(itemsByField.get(id) ?? []), item]);
  }
  const currentById = new Map((snapshot?.fields ?? []).map(field => [field.id, toList(field.value)]));

  return new Map(catalogue.map(entry => {
    const items = [...(itemsByField.get(entry.id) ?? [])].sort(byTimestampAsc);
    // With a snapshot, a field missing from it no longer exists on the entity, i.e. it is empty now.
    const current = snapshot ? currentById.get(entry.id) ?? [] : null;
    if (items.length === 0) {
      return [entry.id, {initial: current ?? [], afterById: new Map()}];
    }
    const {before, after} = buildFieldStates(items, current, entry.isMulti);
    return [entry.id, {initial: before, afterById: new Map(items.map((item, index) => [item.id, after[index]]))}];
  }));
};

/** Text of a part at creation: the oldest change's `removed`, or the current text if never changed. */
const initialText = (
  kind: TextKind,
  adapter: EntityAdapter,
  textItems: ActivityItem[],
  oldestRemoved: OldestRemovedByKind,
  snapshot: EntitySnapshot | null
): string => {
  const items = textItems.filter(item => kindOfItem(item, adapter) === kind).sort(byTimestampAsc);
  if (items.length === 0) {
    return (kind === 'Summary' ? snapshot?.summary : snapshot?.body) ?? '';
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

interface EntityState {
  summary: string;
  body: string;
  fields: Map<string, FieldItemValue[]>;
}

const pushUnique = (list: string[], value: string): void => {
  if (!list.includes(value)) {
    list.push(value);
  }
};

/**
 * Builds the timeline of complete entity states, newest first. v1 is the state at creation; every
 * later version is the state after one save (all activity items sharing a timestamp).
 */
export function buildVersions(
  adapter: EntityAdapter,
  textItems: ActivityItem[],
  fieldItems: FieldActivityItem[],
  oldestRemoved: OldestRemovedByKind,
  snapshot: EntitySnapshot | null,
  locale: string | undefined
): Version[] {
  const catalogue = buildCatalogue(snapshot, fieldItems);
  const timelines = buildFieldTimelines(catalogue, fieldItems, snapshot);
  const labelById = new Map(catalogue.map(entry => [entry.id, entry.label]));

  const state: EntityState = {
    summary: initialText('Summary', adapter, textItems, oldestRemoved, snapshot),
    body: initialText('Body', adapter, textItems, oldestRemoved, snapshot),
    fields: new Map([...timelines].map(([id, timeline]) => [id, timeline.initial]))
  };
  const render = (): Pick<Version, 'summary' | 'body' | 'contentText' | 'fieldsText'> => ({
    summary: state.summary,
    body: state.body,
    contentText: renderContent(state.summary, state.body, adapter),
    fieldsText: renderFieldLines(state.fields, catalogue, locale)
  });

  const versions: Version[] = [{
    id: 'initial',
    number: 1,
    timestamp: snapshot?.created ?? null,
    author: snapshot?.reporter ?? null,
    isInitial: true,
    changedParts: new Set(partsFor(adapter)),
    label: 'Created',
    ...render()
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
        const kind = kindOfItem(event.item, adapter);
        state[kind === 'Summary' ? 'summary' : 'body'] = event.item.added ?? '';
        changedParts.add('Content');
        pushUnique(labels, kindLabel(kind, adapter));
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
      ...render()
    });
  }

  return versions.reverse();
}
