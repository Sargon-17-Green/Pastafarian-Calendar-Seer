import type {
  BatchQueryOptions,
  BatchRequest,
  BatchResponse,
  CalculationDayRequest,
  CalculationDayResponse,
  DateRequest,
  DateResponse,
  ExactInteger,
  GregorianDateInput,
  GregorianDateOutput,
  LocaleMetadata,
  QueryExecutionOptions,
  QueryNowOptions,
  RangeQueryOptions,
  RangeRequest,
  RangeResponse,
  ReverseRequest,
  ReverseResponse,
  SeerErrorCode,
  YearRequest,
  YearResponse,
} from '../types/public.js';

export type * from '../types/public.js';

export const DEFAULT_GENERATED_DIR: string;
export const DEFAULT_LOCALE: 'en';

export class SeerQueryError extends Error {
  code: SeerErrorCode;
  field?: string;
  details?: unknown;
  constructor(
    code: SeerErrorCode,
    message: string,
    options?: { field?: string; details?: unknown; cause?: unknown },
  );
}

export function gregorianToJdn(input: GregorianDateInput, field?: string): bigint;
export function jdnToGregorian(jdn: ExactInteger): GregorianDateOutput;
export function listLocales(): readonly Readonly<LocaleMetadata>[];

export function queryDate(
  request?: DateRequest,
  options?: QueryExecutionOptions,
): Promise<DateResponse>;
export function queryNow(options?: QueryNowOptions): Promise<DateResponse>;
export function queryBatch(
  request: BatchRequest,
  options?: BatchQueryOptions,
): Promise<BatchResponse>;
export function queryRange(
  request: RangeRequest,
  options?: RangeQueryOptions,
): Promise<RangeResponse>;
export function queryReverse(
  request: ReverseRequest,
  options?: QueryExecutionOptions,
): Promise<ReverseResponse>;
export function queryCalculationDay(
  request?: CalculationDayRequest,
  options?: QueryExecutionOptions,
): Promise<CalculationDayResponse>;
export function queryYear(
  year: ExactInteger,
  request?: YearRequest,
  options?: QueryExecutionOptions,
): Promise<YearResponse>;
