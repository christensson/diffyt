import type {FieldScalar, FieldValue, FieldValueObject} from './api';
import {type DateFormat, formatDateOnly, formatDateTime} from './date-format';

export type FieldItemValue = FieldScalar | FieldValueObject;

/** Normalizes a field value (null, scalar, object, or array) to a list of single values. */
export const toList = (value: FieldValue | undefined): FieldItemValue[] => {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const isObject = (value: FieldItemValue): value is FieldValueObject => typeof value === 'object';

/** Identity used to add/remove values when reconstructing multi-value states. */
export const valueKey = (value: FieldItemValue): string => {
  if (isObject(value)) {
    return value.id ?? value.name ?? value.presentation ?? value.text ?? JSON.stringify(value);
  }
  return String(value);
};

/** Human-readable form of one value; `fieldTypeId` is e.g. "enum[1]", "date", "date and time", "period". */
export const presentOne = (value: FieldItemValue, fieldTypeId: string, dateFormat: DateFormat): string => {
  if (isObject(value)) {
    return value.text ?? value.presentation ?? value.localizedName ?? value.name ?? value.fullName ?? value.login ?? value.id ?? '';
  }
  if (typeof value === 'number' && fieldTypeId === 'date') {
    return formatDateOnly(value, dateFormat);
  }
  if (typeof value === 'number' && fieldTypeId === 'date and time') {
    return formatDateTime(value, dateFormat);
  }
  return String(value);
};

/**
 * The text of a single-value text field: `TextFieldValue.text` in the snapshot, a plain string in
 * `TextCustomFieldActivityItem.added`/`removed`. Empty when the field has no value.
 */
export const textOf = (values: FieldItemValue[]): string => {
  const [value] = values;
  if (value === undefined) {
    return '';
  }
  return isObject(value) ? value.text ?? value.presentation ?? '' : String(value);
};

/**
 * `label: value` for single-value fields, a YAML-style list for multi-value fields,
 * and just `label:` when the field is empty.
 */
export const formatFieldText = (
  label: string,
  values: FieldItemValue[],
  isMulti: boolean,
  fieldTypeId: string,
  dateFormat: DateFormat
): string => {
  const presented = values.map(value => presentOne(value, fieldTypeId, dateFormat));
  if (presented.length === 0) {
    return `${label}:`;
  }
  if (isMulti) {
    return [`${label}:`, ...presented.map(item => `- ${item}`)].join('\n');
  }
  return `${label}: ${presented.join(', ')}`;
};

export const isMultiValueType = (fieldType: {id: string; isMultiValue?: boolean} | null): boolean =>
  fieldType?.isMultiValue === true || (fieldType?.id.endsWith('[*]') ?? false);

const without = (list: FieldItemValue[], remove: FieldItemValue[]): FieldItemValue[] => {
  const keys = new Set(remove.map(valueKey));
  return list.filter(value => !keys.has(valueKey(value)));
};

const union = (list: FieldItemValue[], add: FieldItemValue[]): FieldItemValue[] => [...without(list, add), ...add];

/** Multi-value state before a change: after − added + removed. */
export const stateBefore = (after: FieldItemValue[], added: FieldValue, removed: FieldValue): FieldItemValue[] =>
  union(without(after, toList(added)), toList(removed));

/** Multi-value state after a change: before − removed + added. */
export const stateAfter = (before: FieldItemValue[], added: FieldValue, removed: FieldValue): FieldItemValue[] =>
  union(without(before, toList(removed)), toList(added));
