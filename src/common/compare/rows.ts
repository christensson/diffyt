import type {EntityAdapter} from './entity';
import {type Part, type Version, partsFor, versionsFor} from './versions';

/** What the version list shows: one part, or every change of every part in one timeline. */
export type View = Part | 'All';

/** Views available for an entity kind; articles only have Content, so they get no tab row. */
export const viewsFor = (adapter: EntityAdapter): readonly View[] =>
  (adapter.supportsFields ? ['All', ...partsFor(adapter)] : partsFor(adapter));

/**
 * One list row. In the All view a save that changed both parts is split into one row per part; v1 is
 * a single row with `part` null because it is a full state that pairs with rows of either kind.
 */
export interface VersionRow {
  /** The version id, or `${version.id}:${part}` for the split rows of the All view. */
  key: string;
  version: Version;
  part: Part | null;
  /** "Initial", or the changed names of this row's part. */
  label: string;
}

const rowFor = (version: Version, part: Part | null, key: string, label: string): VersionRow => ({key, version, part, label});

/** Rows of a view, newest first. */
export const rowsFor = (versions: Version[], view: View): VersionRow[] => {
  if (view !== 'All') {
    return versionsFor(versions, view).map(version =>
      rowFor(version, version.isInitial ? null : view, version.id, version.label));
  }
  return versions.flatMap(version => {
    if (version.isInitial) {
      return [rowFor(version, null, version.id, version.label)];
    }
    return (['Content', 'Fields'] as const)
      .filter(part => version.changedParts.has(part))
      .map(part => rowFor(version, part, `${version.id}:${part}`, version.partLabels[part].join(', ')));
  });
};

export const findRow = (rows: VersionRow[], key: string): VersionRow | undefined => rows.find(row => row.key === key);

/** The part the selection is committed to: that of the first selected row with a part, if any. */
export const selectedPart = (rows: VersionRow[], selectedKeys: string[]): Part | null => {
  for (const key of selectedKeys) {
    const part = findRow(rows, key)?.part ?? null;
    if (part !== null) {
      return part;
    }
  }
  return null;
};

/** A row of the other kind cannot join the selection; Initial rows always can. */
export const isRowDisabled = (row: VersionRow, part: Part | null): boolean =>
  row.part !== null && part !== null && row.part !== part;
