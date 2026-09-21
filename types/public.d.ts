/** Canonical base-10 integer text accepted and returned by the public API. */
export type ExactIntegerString = `${bigint}`;
/** Exact integer input. Runtime rejects unsafe numeric integers. */
export type ExactInteger = bigint | number | ExactIntegerString;
export type Rfc3339Timestamp = string;
export type GregorianEra = 'CE' | 'BCE';
export type GregorianDateString = string;

export interface GregorianDateObject {
  era: GregorianEra;
  year: ExactInteger;
  month: number;
  day: number;
}
export type GregorianDateInput = GregorianDateString | GregorianDateObject;
export interface GregorianDateOutput {
  era: GregorianEra;
  year: ExactIntegerString;
  month: number;
  day: number;
}

export type CalculationSelector =
  | { jdn: ExactInteger; at?: never }
  | { at: Rfc3339Timestamp; jdn?: never };

export type TargetSelector =
  | { jdn: ExactInteger; gregorian?: never; offsetDays?: never }
  | { gregorian: GregorianDateInput; jdn?: never; offsetDays?: never }
  | { offsetDays: ExactInteger; jdn?: never; gregorian?: never };

interface ObserverNoOps {
  latitude?: unknown;
  elevationMeters?: unknown;
}
export type ObserverInput = ObserverNoOps & (
  | { preset: 'kisurra'; longitude?: never }
  | { longitude: number; preset?: never }
  | { preset?: never; longitude?: never }
);
export type ClientObserverInput = ObserverInput | 'kisurra';

export type Presentation = 'full' | 'canonical';
export type DateInclude = 'structure' | 'boundaries' | 'provenance' | 'resolution';
export type YearInclude = 'days' | 'provenance' | 'resolution';
export type CalculationDayInclude = 'boundaries';

export interface DateRequest {
  observer?: ObserverInput;
  calculation?: CalculationSelector;
  target?: TargetSelector;
  locale?: string;
  presentation?: Presentation;
  include?: readonly DateInclude[];
}
export interface NowRequest {
  observer?: ObserverInput;
  locale?: string;
  presentation?: Presentation;
  include?: readonly DateInclude[];
}
export interface CalculationDayRequest {
  at?: Rfc3339Timestamp;
  observer?: ObserverInput;
  include?: readonly CalculationDayInclude[];
}
export interface YearRequest {
  observer?: ObserverInput;
  calculation?: CalculationSelector;
  locale?: string;
  presentation?: Presentation;
  include?: readonly YearInclude[];
}

export interface PastafarianCoordinateInput {
  canonicalIndex: ExactInteger;
  day: ExactInteger;
}
export interface PastafarianDateInput {
  year: ExactInteger;
  cutlet: PastafarianCoordinateInput;
  month: PastafarianCoordinateInput;
}
export interface ReverseRequest {
  observer?: ObserverInput;
  calculation?: CalculationSelector;
  pastafarianDate: PastafarianDateInput;
  locale?: string;
  presentation?: Presentation;
  include?: readonly DateInclude[];
}

export interface PastafarianCoordinate {
  canonicalIndex: number;
  day: number;
  name?: string;
}
export interface PastafarianDate {
  year: ExactIntegerString;
  cutlet: PastafarianCoordinate;
  month: PastafarianCoordinate;
}

export interface ResolvedObserver {
  longitude: number;
}
export interface CalculationDayRef {
  jdn: ExactIntegerString;
}
export interface TargetDay {
  jdn: ExactIntegerString;
  gregorian: GregorianDateOutput;
}
export interface DayBoundaries {
  startsAt: Rfc3339Timestamp;
  endsAt: Rfc3339Timestamp;
}
export interface DateStructure {
  dayInYear?: number;
  yearLengthDays?: number;
  cutletCount?: number;
  currentCutletLengthDays?: number;
  monthCount?: number;
  currentMonthLengthDays?: number;
}
export interface Provenance {
  calendarRevision?: string;
  engineRevision?: string;
  dataRevision?: string;
  [key: string]: unknown;
}
export type CalculationSource = 'request-instant' | 'explicit-instant' | 'explicit-jdn';
export type TargetSource = 'same-as-calculation' | 'jdn' | 'gregorian' | 'offset' | 'pastafarian-date';
export type ObserverSource = 'default-preset' | 'preset' | 'longitude';
export interface DateResolution {
  calculationSource?: CalculationSource;
  targetSource?: TargetSource;
  observerSource?: ObserverSource;
}
export interface DateResponse {
  calculationAt?: Rfc3339Timestamp;
  calculationDay: CalculationDayRef;
  observer?: ResolvedObserver;
  targetDay: TargetDay;
  pastafarianDate: PastafarianDate;
  locale?: string;
  formatted?: string;
  structure?: DateStructure;
  boundaries?: DayBoundaries;
  provenance?: Provenance;
  resolution?: DateResolution;
}
export type ReverseResponse = DateResponse;

export interface BatchDefaults {
  observer?: ObserverInput;
  calculation?: CalculationSelector;
  locale?: string;
  presentation?: Presentation;
  include?: readonly DateInclude[];
}
export type BatchItem = DateRequest & { id?: string };
export interface BatchRequest {
  defaults?: BatchDefaults;
  queries: readonly BatchItem[];
}

export type KnownSeerErrorCode =
  | 'INVALID_JSON' | 'UNKNOWN_PARAMETER' | 'DUPLICATE_PARAMETER'
  | 'MISSING_CALCULATION_SELECTOR' | 'CONFLICTING_CALCULATION'
  | 'MISSING_TARGET_SELECTOR' | 'MISSING_PASTAFARIAN_DATE'
  | 'AMBIGUOUS_TARGET' | 'AMBIGUOUS_OBSERVER' | 'INVALID_OBSERVER'
  | 'DUPLICATE_BATCH_ID' | 'UNSUPPORTED_PRESENTATION' | 'INVALID_LOCALE'
  | 'UNSUPPORTED_INCLUDE' | 'AMBIGUOUS_RANGE_END' | 'MISSING_RANGE_END'
  | 'INVALID_INTEGER' | 'INVALID_JDN' | 'INVALID_GREGORIAN_DATE'
  | 'INVALID_INSTANT' | 'INVALID_LONGITUDE' | 'OBSERVER_PRESET_NOT_SUPPORTED'
  | 'INVALID_RANGE_COUNT' | 'INVALID_RANGE_STEP' | 'UNREACHABLE_RANGE_END'
  | 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN' | 'TARGET_OUT_OF_SUPPORTED_DOMAIN'
  | 'YEAR_OUT_OF_SUPPORTED_DOMAIN' | 'INVALID_PASTAFARIAN_DATE'
  | 'PASTAFARIAN_DATE_NOT_IN_YEAR' | 'PASTAFARIAN_DATE_CONFLICT'
  | 'LOCALE_NOT_SUPPORTED' | 'REQUEST_TOO_LARGE' | 'SEER_UNAVAILABLE'
  | 'INTERNAL_ERROR' | 'UNSUPPORTED_MEDIA_TYPE' | 'NOT_ACCEPTABLE'
  | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED';
export type SeerErrorCode = KnownSeerErrorCode | (string & {});
export interface SeerError {
  code: SeerErrorCode;
  message: string;
  field?: string;
  details?: unknown;
}
export type BatchResultItem =
  | { id?: string; ok: true; result: DateResponse }
  | { id?: string; ok: false; error: SeerError };
export interface BatchResponse {
  results: BatchResultItem[];
}

interface RangeBase {
  observer?: ObserverInput;
  calculation?: CalculationSelector;
  start?: TargetSelector;
  stepDays?: ExactInteger;
  calculationMode?: 'fixed' | 'same-as-target';
  locale?: string;
  presentation?: Presentation;
  include?: readonly DateInclude[];
}
export type RangeRequest = RangeBase & (
  | { count: ExactInteger; endInclusive?: never }
  | { endInclusive: TargetSelector; count?: never }
);
export interface RangeResponse {
  results: DateResponse[];
}

export interface CalculationDayResponse {
  at: Rfc3339Timestamp;
  jdn: ExactIntegerString;
  observer: ResolvedObserver;
  boundaries?: DayBoundaries;
}

export interface YearCutlet {
  canonicalIndex: number;
  name?: string;
  lengthDays: number;
  startOffset: number;
  endOffset: number;
}
export interface YearMonth {
  canonicalIndex: number;
  name?: string;
  lengthDays: number;
}
export interface YearDay {
  targetDay: TargetDay;
  pastafarianDate: PastafarianDate;
}
export interface PastafarianYear {
  number: ExactIntegerString;
  lengthDays: number;
  startJdn: ExactIntegerString;
  endJdn: ExactIntegerString;
  cutlets: YearCutlet[];
  months: YearMonth[];
  days?: YearDay[];
}
export interface YearResponse {
  calculationAt?: Rfc3339Timestamp;
  calculationDay: CalculationDayRef;
  observer?: ResolvedObserver;
  locale?: string;
  year: PastafarianYear;
  provenance?: Provenance;
  resolution?: Pick<DateResolution, 'calculationSource' | 'observerSource'>;
}

export interface LocaleMetadata {
  tag: string;
  code: string;
  name: string;
  selfName: string;
  direction: 'ltr' | 'rtl';
  default: boolean;
  schemaVersion: 1;
  version: string;
  properNamePolicy: 'localized' | 'english-retained';
}
export interface LocalesResponse {
  locales: LocaleMetadata[];
}
export type ArtifactMode = 'source' | 'package' | 'container';
export type SupportedFeature =
  | 'now-query' | 'date-query' | 'batch-query' | 'range-query'
  | 'range-ndjson' | 'range-csv' | 'year-query' | 'reverse-query'
  | 'calculation-day' | 'locales' | 'canonical-presentation'
  | 'full-presentation' | 'public-status' | 'openapi';
export interface MetaResponse {
  apiVersion: 'v1';
  presentations: Presentation[];
  includes: DateInclude[];
  observerPresets: Array<{ id: string; longitude: number }>;
  reverse: { status: 'implemented'; endpoint: '/v1/reverse'; requiresCompleteTuple: true };
  exactDomain?: {
    kind: 'finite';
    minimumJdnExclusive: ExactIntegerString;
    maximumJdnInclusive: ExactIntegerString;
  };
  packageVersion: string;
  releaseTag: string | null;
  commit: string | null;
  artifactMode: ArtifactMode;
  engineFingerprint: string;
  supportedFeatures: SupportedFeature[];
  cacheRevision: string | null;
  [key: string]: unknown;
}
export interface StatusResponse {
  status: 'ok' | 'degraded' | 'unavailable';
}
export interface ErrorResponse {
  error: SeerError;
}

export interface QueryExecutionOptions {
  generatedDir?: string;
  provider?: unknown;
  now?: Date | string | number;
  dayBoundaryService?: unknown;
  maxExactConcurrency?: number;
  maxExactQueue?: number;
}
export interface BatchQueryOptions extends QueryExecutionOptions {
  maxBatchItems?: number;
}
export interface RangeQueryOptions extends QueryExecutionOptions {
  maxRangeItems?: number;
}
export type QueryNowOptions = DateRequest & QueryExecutionOptions;
