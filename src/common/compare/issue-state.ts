import type {EntitySnapshot, SnapshotField} from './api';
import type {DateFormat} from './date-format';
import type {EntityAdapter} from './entity';
import {type FieldItemValue, formatFieldText, isMultiValueType, textOf, toList} from './field-values';

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

/** Multi-line text fields (type `text`) are Content sections rather than `key: value` lines of the Fields text. */
export const isTextEntry = (entry: CatalogueEntry): boolean => entry.typeId === 'text';

export const textEntries = (catalogue: CatalogueEntry[]): CatalogueEntry[] => catalogue.filter(isTextEntry);

/** Labels of the text fields, i.e. the headings of the Content sections after Summary and the body. */
export const textLabels = (catalogue: CatalogueEntry[]): string[] => textEntries(catalogue).map(entry => entry.label);

/** One Content section for a text field: its label as heading and its text. */
export interface TextSection {
  label: string;
  text: string;
}

export const textSections = (values: ReadonlyMap<string, FieldItemValue[]>, catalogue: CatalogueEntry[]): TextSection[] =>
  textEntries(catalogue).map(entry => ({label: entry.label, text: textOf(values.get(entry.id) ?? [])}));

/** Section heading lines of the Content text. */
export const SUMMARY_MARKER = 'Summary:';
export const bodyMarker = (adapter: EntityAdapter): string => `${adapter.bodyLabel}:`;
const sectionMarker = (label: string): string => `${label}:`;
export const contentMarkers = (adapter: EntityAdapter, textFieldLabels: readonly string[] = []): string[] =>
  [SUMMARY_MARKER, bodyMarker(adapter), ...textFieldLabels.map(sectionMarker)];

/**
 * `Summary:` heading, the summary, a blank line, the body heading, the body text, and then one
 * `<label>:` heading and text per text field, each preceded by a blank line.
 */
export const renderContent = (summary: string, body: string, adapter: EntityAdapter, sections: TextSection[] = []): string =>
  [
    `${SUMMARY_MARKER}\n${summary}`,
    `${bodyMarker(adapter)}\n${body}`,
    ...sections.map(section => `${sectionMarker(section.label)}\n${section.text}`)
  ].join('\n\n');

/** 1-based numbers of the lines whose whole text equals `marker`. */
export const markerLineNumbers = (text: string, marker: string): number[] =>
  text.split('\n').flatMap((line, index) => (line === marker ? [index + 1] : []));

/** One `key: value` (or YAML list) entry per catalogue field; text fields are left to the Content text. */
export const renderFieldLines = (
  values: ReadonlyMap<string, FieldItemValue[]>,
  catalogue: CatalogueEntry[],
  dateFormat: DateFormat
): string =>
  catalogue
    .filter(entry => !isTextEntry(entry))
    .map(entry => formatFieldText(entry.label, values.get(entry.id) ?? [], entry.isMulti, entry.typeId, dateFormat))
    .join('\n');

/** Current field values of an entity keyed by custom field id. */
export const snapshotValues = (snapshot: EntitySnapshot): Map<string, FieldItemValue[]> =>
  new Map(snapshot.fields.map(field => [field.id, toList(field.value)]));

/** The Fields text of an entity as it is now. */
export const renderFieldsFor = (snapshot: EntitySnapshot, catalogue: CatalogueEntry[], dateFormat: DateFormat): string =>
  renderFieldLines(snapshotValues(snapshot), catalogue, dateFormat);

/** The Content text of an entity as it is now, including its text field sections. */
export const renderContentFor = (snapshot: EntitySnapshot, catalogue: CatalogueEntry[], adapter: EntityAdapter): string =>
  renderContent(snapshot.summary, snapshot.body, adapter, textSections(snapshotValues(snapshot), catalogue));
