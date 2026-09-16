import type {EntitySnapshot, SnapshotField} from './api';
import type {EntityAdapter} from './entity';
import {type FieldItemValue, formatFieldText, isMultiValueType, toList} from './field-values';

/** One custom field to show in the Fields text, in display order. */
export interface CatalogueEntry {
  id: string;
  label: string;
  isMulti: boolean;
  typeId: string;
}

export const entryFromSnapshotField = (field: SnapshotField): CatalogueEntry => ({
  id: field.id,
  label: field.label,
  isMulti: isMultiValueType(field.fieldType),
  typeId: field.fieldType?.id ?? ''
});

/** Appends the entries of `extra` that `base` does not have yet, sorted by label. */
export const mergeCatalogue = (base: CatalogueEntry[], extra: CatalogueEntry[]): CatalogueEntry[] => {
  const seen = new Set(base.map(entry => entry.id));
  const additions: CatalogueEntry[] = [];
  for (const entry of extra) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      additions.push(entry);
    }
  }
  additions.sort((a, b) => a.label.localeCompare(b.label));
  return [...base, ...additions];
};

/** Fields of the first snapshot in project order, then any extra fields of the others. */
export const buildCatalogue = (snapshots: EntitySnapshot[]): CatalogueEntry[] =>
  snapshots
    .map(snapshot => snapshot.fields.map(entryFromSnapshotField))
    .reduce<CatalogueEntry[]>((catalogue, entries) => mergeCatalogue(catalogue, entries), []);

/** Section heading lines of the Content text. */
export const SUMMARY_MARKER = 'Summary:';
export const bodyMarker = (adapter: EntityAdapter): string => `${adapter.bodyLabel}:`;
export const contentMarkers = (adapter: EntityAdapter): string[] => [SUMMARY_MARKER, bodyMarker(adapter)];

/** `Summary:` heading, the summary, a blank line, the body heading, and the body text. */
export const renderContent = (summary: string, body: string, adapter: EntityAdapter): string =>
  `${SUMMARY_MARKER}\n${summary}\n\n${bodyMarker(adapter)}\n${body}`;

/** 1-based numbers of the lines whose whole text equals `marker`. */
export const markerLineNumbers = (text: string, marker: string): number[] =>
  text.split('\n').flatMap((line, index) => (line === marker ? [index + 1] : []));

/** One `key: value` (or YAML list) entry per catalogue field. */
export const renderFieldLines = (
  values: ReadonlyMap<string, FieldItemValue[]>,
  catalogue: CatalogueEntry[],
  locale: string | undefined
): string =>
  catalogue
    .map(entry => formatFieldText(entry.label, values.get(entry.id) ?? [], entry.isMulti, entry.typeId, locale))
    .join('\n');

/** The Fields text of an entity as it is now. */
export const renderFieldsFor = (snapshot: EntitySnapshot, catalogue: CatalogueEntry[], locale: string | undefined): string =>
  renderFieldLines(new Map(snapshot.fields.map(field => [field.id, toList(field.value)])), catalogue, locale);
