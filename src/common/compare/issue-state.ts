import type {IssueSnapshot, SnapshotField} from './api';
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
export const buildCatalogue = (snapshots: IssueSnapshot[]): CatalogueEntry[] =>
  snapshots
    .map(snapshot => snapshot.fields.map(entryFromSnapshotField))
    .reduce<CatalogueEntry[]>((catalogue, entries) => mergeCatalogue(catalogue, entries), []);

/** Summary on the first line, then a blank line, `Description:`, and the description. */
export const renderContent = (summary: string, description: string): string =>
  `${summary}\n\nDescription:\n${description}`;

/** One `key: value` (or YAML list) entry per catalogue field. */
export const renderFieldLines = (
  values: ReadonlyMap<string, FieldItemValue[]>,
  catalogue: CatalogueEntry[],
  locale: string | undefined
): string =>
  catalogue
    .map(entry => formatFieldText(entry.label, values.get(entry.id) ?? [], entry.isMulti, entry.typeId, locale))
    .join('\n');

/** The Fields text of an issue as it is now. */
export const renderFieldsFor = (snapshot: IssueSnapshot, catalogue: CatalogueEntry[], locale: string | undefined): string =>
  renderFieldLines(new Map(snapshot.fields.map(field => [field.id, toList(field.value)])), catalogue, locale);
