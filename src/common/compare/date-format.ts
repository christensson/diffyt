import type {HostAPI} from '../../../@types/globals';
import {createComponentLogger} from '@/common/utils/logger';

const logger = createComponentLogger('date-format');

/**
 * How the current user wants dates shown: the Java-style patterns picked in the YouTrack profile
 * (Profile → General → Date format), the profile time zone, and the locale for month/weekday names.
 */
export interface DateFormat {
  /** Pattern for values with a time, e.g. `d MMM yyyy HH:mm`. */
  pattern: string;
  /** Pattern for date-only values, e.g. `d MMM yyyy`. */
  datePattern: string;
  /** IANA time zone id from the profile; the browser's zone when undefined. */
  timeZone?: string;
  /** BCP-47 locale; the browser's locale when undefined. */
  locale?: string;
}

/** YouTrack's default descriptor ("Medium date with time (31 Dec 2000 23:59)"). */
export const DEFAULT_DATE_FORMAT: DateFormat = {pattern: 'd MMM yyyy HH:mm', datePattern: 'd MMM yyyy'};

const PROFILE_FIELDS = 'profiles(general(dateFieldFormat(pattern,datePattern),timezone(id),locale(locale)))';

interface RawProfile {
  profiles?: {
    general?: {
      dateFieldFormat?: {pattern?: string | null; datePattern?: string | null} | null;
      timezone?: {id?: string | null} | null;
      locale?: {locale?: string | null} | null;
    } | null;
  } | null;
}

/** YouTrack reports locales as `en_US`; Intl wants `en-US`. */
const toBcp47 = (locale: string | null | undefined): string | undefined => (locale ? locale.replace(/_/g, '-') : undefined);

type RawGeneral = NonNullable<NonNullable<RawProfile['profiles']>['general']>;

const fromProfile = (general: RawGeneral | null | undefined, uiLocale: string | undefined): DateFormat => ({
  pattern: general?.dateFieldFormat?.pattern || DEFAULT_DATE_FORMAT.pattern,
  datePattern: general?.dateFieldFormat?.datePattern || DEFAULT_DATE_FORMAT.datePattern,
  timeZone: general?.timezone?.id || undefined,
  locale: toBcp47(general?.locale?.locale || uiLocale)
});

/** Reads the profile's date format, time zone and locale; falls back to the defaults and `uiLocale` on failure. */
export async function fetchDateFormat(host: HostAPI, uiLocale: string | undefined): Promise<DateFormat> {
  try {
    const raw = (await host.fetchYouTrack(`users/me?fields=${PROFILE_FIELDS}`, {})) as RawProfile | null;
    return fromProfile(raw?.profiles?.general, uiLocale);
  } catch (error) {
    logger.warn('Failed to load the profile date format; using the default', undefined, error);
    return {...DEFAULT_DATE_FORMAT, locale: toBcp47(uiLocale)};
  }
}

type Zone = Pick<DateFormat, 'locale' | 'timeZone'>;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached Intl formatter; unsupported profile locale/zone degrade to the browser's. */
const formatter = (zone: Zone, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const key = `${zone.locale ?? ''}|${zone.timeZone ?? ''}|${JSON.stringify(options)}`;
  const cached = formatters.get(key);
  if (cached) {
    return cached;
  }
  const attempts: Zone[] = [zone, {timeZone: zone.timeZone}, {}];
  let created: Intl.DateTimeFormat | undefined;
  for (const attempt of attempts) {
    try {
      created = new Intl.DateTimeFormat(attempt.locale, {...options, timeZone: attempt.timeZone});
      break;
    } catch {
      // try the next, less specific combination
    }
  }
  const result = created ?? new Intl.DateTimeFormat(undefined, options);
  formatters.set(key, result);
  return result;
};

const partsOf = (zone: Zone, options: Intl.DateTimeFormatOptions, timestamp: number): Partial<Record<Intl.DateTimeFormatPartTypes, string>> =>
  Object.fromEntries(formatter(zone, options).formatToParts(timestamp).map(part => [part.type, part.value]));

// Digits come from en-US so they are always Latin; names come from the user's locale.
const NUMERIC_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
};

const HOURS_ON_CLOCK = 12;
const TWO_DIGIT_YEAR = 2;
const LONG_NAME = 4;
const SHORT_NAME = 3;

interface Components {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const componentsOf = (timestamp: number, zone: Zone): Components => {
  const parts = partsOf({locale: 'en-US', timeZone: zone.timeZone}, NUMERIC_OPTIONS, timestamp);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % (HOURS_ON_CLOCK * 2),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
};

interface TokenContext {
  timestamp: number;
  zone: Zone;
  components: Components;
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const monthName = ({timestamp, zone}: TokenContext, width: number): string =>
  partsOf(zone, {month: width >= LONG_NAME ? 'long' : 'short'}, timestamp).month ?? '';

const weekdayName = ({timestamp, zone}: TokenContext, width: number): string =>
  partsOf(zone, {weekday: width >= LONG_NAME ? 'long' : 'short'}, timestamp).weekday ?? '';

const dayPeriod = ({timestamp, zone, components}: TokenContext): string =>
  partsOf(zone, {hour: 'numeric', hour12: true}, timestamp).dayPeriod ?? (components.hour < HOURS_ON_CLOCK ? 'AM' : 'PM');

/** Java `SimpleDateFormat` letters supported: y M d H h m s a E. Width is the run length, e.g. 3 for `MMM`. */
const TOKENS: Record<string, (context: TokenContext, width: number) => string> = {
  y: ({components}, width) => (width === TWO_DIGIT_YEAR ? pad(components.year % 100, TWO_DIGIT_YEAR) : String(components.year)),
  M: (context, width) => (width >= SHORT_NAME ? monthName(context, width) : pad(context.components.month, width)),
  d: ({components}, width) => pad(components.day, width),
  H: ({components}, width) => pad(components.hour, width),
  h: ({components}, width) => pad(components.hour % HOURS_ON_CLOCK || HOURS_ON_CLOCK, width),
  m: ({components}, width) => pad(components.minute, width),
  s: ({components}, width) => pad(components.second, width),
  a: dayPeriod,
  E: weekdayName
};

/** A run of one pattern letter, a `'quoted'` literal (`''` is a quote), or any other single character. */
const TOKEN_PATTERN = /([yMdHhmsaE])\1*|'(?:[^']|'')*'|./gu;

/** Formats a timestamp with a Java-style pattern such as `d MMM yyyy HH:mm` in the given zone and locale. */
export const formatPattern = (timestamp: number, pattern: string, zone: Zone): string => {
  const context: TokenContext = {timestamp, zone, components: componentsOf(timestamp, zone)};
  return pattern.replace(TOKEN_PATTERN, token => {
    if (token.startsWith("'")) {
      return token === "''" ? "'" : token.slice(1, -1).replace(/''/g, "'");
    }
    const render = TOKENS[token[0]];
    return render ? render(context, token.length) : token;
  });
};

/** A point in time, in the profile's time zone and date-with-time pattern. */
export const formatDateTime = (timestamp: number, format: DateFormat): string =>
  formatPattern(timestamp, format.pattern, format);

/** A date-only value (stored as midnight UTC), in the profile's date pattern. */
export const formatDateOnly = (timestamp: number, format: DateFormat): string =>
  formatPattern(timestamp, format.datePattern, {locale: format.locale, timeZone: 'UTC'});
