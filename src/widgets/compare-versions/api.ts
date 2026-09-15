import type {HostAPI} from '../../../@types/globals';

export type TextCategoryId = 'SummaryCategory' | 'DescriptionCategory';

export interface ActivityAuthor {
  id: string;
  login: string;
  name: string;
  fullName?: string | null;
}

/**
 * Summary/Description change (`SimpleValueActivityItem` / `TextMarkupActivityItem`).
 * Only `added` (the value after the change) is loaded for the full list; each item's `removed`
 * equals the previous item's `added`, so it is fetched once, for the oldest item only.
 */
export interface ActivityItem {
  $type: string;
  id: string;
  timestamp: number;
  added: string | null;
  author: ActivityAuthor | null;
  category: {id: string};
  field: {presentation: string} | null;
}

/** A custom field value as returned in `added`/`removed` or in the issue's `customFields[].value`. */
export interface FieldValueObject {
  id?: string;
  $type?: string;
  name?: string | null;
  localizedName?: string | null;
  fullName?: string | null;
  login?: string | null;
  presentation?: string | null;
  minutes?: number | null;
  text?: string | null;
}
export type FieldScalar = string | number | boolean;
export type FieldValue = FieldScalar | FieldValueObject | Array<FieldScalar | FieldValueObject> | null;

export interface FieldInfo {
  id: string;
  presentation: string;
  name: string;
  customField: {
    id: string;
    name: string;
    fieldType: {id: string; isMultiValue?: boolean} | null;
  } | null;
}

/** Custom field change (`CustomFieldActivityItem` / `TextCustomFieldActivityItem`). */
export interface FieldActivityItem {
  $type: string;
  id: string;
  timestamp: number;
  added: FieldValue;
  removed: FieldValue;
  author: ActivityAuthor | null;
  field: FieldInfo | null;
}

/** The oldest change of one category: its `removed` is the field's initial content. */
export interface OldestRemoved {
  id: string;
  removed: string | null;
}

export interface IssueSnapshot {
  created: number;
  reporter: ActivityAuthor | null;
  /** Current custom field values keyed by CustomField id. */
  fields: Record<string, FieldValue>;
}

const TEXT_CATEGORIES = 'DescriptionCategory,SummaryCategory';
const TEXT_FIELDS = 'id,$type,timestamp,added,author(id,login,name,fullName),category(id),field(presentation)';
const VALUE_FIELDS = 'id,$type,name,localizedName,fullName,login,presentation,minutes,text';
const FIELD_ACTIVITY_FIELDS =
  `id,$type,timestamp,author(id,login,name,fullName),category(id),added(${VALUE_FIELDS}),removed(${VALUE_FIELDS}),` +
  'field(id,presentation,name,customField(id,name,fieldType(id,isMultiValue)))';

/** YouTrack's default page size for the activities endpoint. */
const PAGE_SIZE = 42;
/** Safety cap so a misbehaving endpoint cannot loop forever. */
const MAX_PAGES = 50;

type Raw = Record<string, unknown>;

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
};

const activitiesUrl = (issueId: string, params: Record<string, string>): string =>
  `issues/${encodeURIComponent(issueId)}/activities?${new URLSearchParams(params).toString()}`;

/** Loads every activity of the given categories; pages are fetched sequentially until a short page. */
async function fetchActivities(host: HostAPI, issueId: string, categories: string, fields: string): Promise<Raw[]> {
  const all: Raw[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = activitiesUrl(issueId, {
      categories,
      fields,
      reverse: 'true',
      $top: String(PAGE_SIZE),
      $skip: String(page * PAGE_SIZE)
    });
    const response = await host.fetchYouTrack(url, {});
    if (!Array.isArray(response)) {
      throw new Error('Unexpected response from the activities endpoint');
    }

    all.push(...(response as Raw[]));

    if (response.length < PAGE_SIZE) {
      break;
    }
  }

  return all;
}

const author = (raw: Raw): ActivityAuthor | null => (raw.author as ActivityAuthor | null | undefined) ?? null;
const timestamp = (raw: Raw): number => Number(raw.timestamp ?? 0);

const normalizeText = (raw: Raw): ActivityItem => ({
  $type: typeof raw.$type === 'string' ? raw.$type : '',
  id: String(raw.id),
  timestamp: timestamp(raw),
  added: asText(raw.added),
  author: author(raw),
  category: (raw.category as ActivityItem['category'] | undefined) ?? {id: ''},
  field: (raw.field as ActivityItem['field'] | undefined) ?? null
});

const normalizeField = (raw: Raw): FieldActivityItem => ({
  $type: typeof raw.$type === 'string' ? raw.$type : '',
  id: String(raw.id),
  timestamp: timestamp(raw),
  added: (raw.added as FieldValue | undefined) ?? null,
  removed: (raw.removed as FieldValue | undefined) ?? null,
  author: author(raw),
  field: (raw.field as FieldInfo | null | undefined) ?? null
});

const newestFirst = <T extends {timestamp: number}>(items: T[]): T[] => items.sort((a, b) => b.timestamp - a.timestamp);

/** All Summary/Description changes, newest first, with `added` only. */
export async function fetchTextActivities(host: HostAPI, issueId: string): Promise<ActivityItem[]> {
  return newestFirst((await fetchActivities(host, issueId, TEXT_CATEGORIES, TEXT_FIELDS)).map(normalizeText));
}

/** All custom field changes, newest first, with `added` and `removed` (values are small). */
export async function fetchFieldActivities(host: HostAPI, issueId: string): Promise<FieldActivityItem[]> {
  return newestFirst((await fetchActivities(host, issueId, 'CustomFieldCategory', FIELD_ACTIVITY_FIELDS)).map(normalizeField));
}

/** Fetches only the oldest change of one text category, with its `removed` (the initial content). */
export async function fetchOldestRemoved(
  host: HostAPI,
  issueId: string,
  category: TextCategoryId
): Promise<OldestRemoved | null> {
  const url = activitiesUrl(issueId, {categories: category, fields: 'id,removed', reverse: 'false', $top: '1'});
  const response = await host.fetchYouTrack(url, {});
  if (!Array.isArray(response) || response.length === 0) {
    return null;
  }
  const raw = response[0] as Raw;
  return {id: String(raw.id), removed: asText(raw.removed)};
}

/** Creation time, reporter, and the current custom field values (the starting point for field history). */
export async function fetchIssueSnapshot(host: HostAPI, issueId: string): Promise<IssueSnapshot> {
  const url =
    `issues/${encodeURIComponent(issueId)}?fields=created,reporter(id,login,name,fullName),` +
    `customFields(id,name,projectCustomField(field(id)),value(${VALUE_FIELDS}))`;
  const raw = ((await host.fetchYouTrack(url, {})) ?? {}) as Raw;

  const fields: Record<string, FieldValue> = {};
  const customFields = Array.isArray(raw.customFields) ? (raw.customFields as Raw[]) : [];
  for (const customField of customFields) {
    const project = customField.projectCustomField as {field?: {id?: string}} | undefined;
    const fieldId = project?.field?.id;
    if (fieldId) {
      fields[fieldId] = (customField.value as FieldValue | undefined) ?? null;
    }
  }

  return {
    created: Number(raw.created ?? 0),
    reporter: (raw.reporter as ActivityAuthor | null | undefined) ?? null,
    fields
  };
}
