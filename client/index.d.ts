import type {
  BatchRequest,
  BatchResponse,
  CalculationDayRequest,
  CalculationDayResponse,
  ClientObserverInput,
  DateRequest,
  DateResponse,
  ExactInteger,
  LocalesResponse,
  MetaResponse,
  NowRequest,
  RangeRequest,
  RangeResponse,
  ReverseRequest,
  ReverseResponse,
  SeerErrorCode,
  StatusResponse,
  YearRequest,
  YearResponse,
} from '../types/public.js';

export type * from '../types/public.js';

export class SeerClientError extends Error {
  status: number;
  code?: SeerErrorCode;
  field?: string;
  details?: unknown;
  response?: unknown;
  constructor(
    message: string,
    options?: {
      status?: number;
      code?: SeerErrorCode;
      field?: string;
      details?: unknown;
      response?: unknown;
    },
  );
}

export type ClientNowRequest = Omit<NowRequest, 'observer'> & {
  observer?: ClientObserverInput;
};
export type ClientYearRequest = Omit<YearRequest, 'observer'> & {
  observer?: ClientObserverInput;
};
export type ClientCalculationDayRequest = Omit<CalculationDayRequest, 'observer'> & {
  observer?: ClientObserverInput;
};

export interface SeerClient {
  readonly baseUrl: string;
  queryDate(request?: DateRequest): Promise<DateResponse>;
  queryNow(request?: ClientNowRequest): Promise<DateResponse>;
  queryBatch(request: BatchRequest): Promise<BatchResponse>;
  queryRange(request: RangeRequest): Promise<RangeResponse>;
  queryReverse(request: ReverseRequest): Promise<ReverseResponse>;
  queryCalculationDay(request?: ClientCalculationDayRequest): Promise<CalculationDayResponse>;
  queryYear(year: ExactInteger, request?: ClientYearRequest): Promise<YearResponse>;
  getLocales(): Promise<LocalesResponse>;
  getMeta(): Promise<MetaResponse>;
  getStatus(): Promise<StatusResponse>;
  getOpenApi(): Promise<Record<string, unknown>>;
}
export interface SeerClientOptions {
  fetch?: typeof globalThis.fetch;
}
export function createSeerClient(baseUrl?: string, options?: SeerClientOptions): SeerClient;
