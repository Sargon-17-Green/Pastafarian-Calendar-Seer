import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ArtifactMode,
  BatchQueryOptions,
  BatchRequest,
  BatchResponse,
  CalculationDayRequest,
  CalculationDayResponse,
  DateRequest,
  DateResponse,
  ExactInteger,
  LocaleMetadata,
  QueryExecutionOptions,
  RangeQueryOptions,
  RangeRequest,
  RangeResponse,
  ReverseRequest,
  YearRequest,
  YearResponse,
} from '../types/public.js';

export interface SeerQueryApi {
  queryDate(request?: DateRequest, options?: QueryExecutionOptions): Promise<DateResponse>;
  queryBatch(request: BatchRequest, options?: BatchQueryOptions): Promise<BatchResponse>;
  queryRange(request: RangeRequest, options?: RangeQueryOptions): Promise<RangeResponse>;
  queryReverse(request: ReverseRequest, options?: QueryExecutionOptions): Promise<DateResponse>;
  queryCalculationDay(
    request?: CalculationDayRequest,
    options?: QueryExecutionOptions,
  ): Promise<CalculationDayResponse>;
  queryYear(
    year: ExactInteger,
    request?: YearRequest,
    options?: QueryExecutionOptions,
  ): Promise<YearResponse>;
  listLocales(): readonly Readonly<LocaleMetadata>[];
}
export interface SeerHttpLogger {
  error?(...args: unknown[]): void;
}
export interface SeerHealthProbe {
  probe(input: { now: Date }): Promise<{ status?: string }> | { status?: string };
}
export interface SeerPublicIdentityProvider {
  snapshot(): Promise<Record<string, unknown>> | Record<string, unknown>;
}
export interface SeerHttpHandlerOptions {
  queryApi?: SeerQueryApi;
  apiDir?: string;
  maxBodyBytes?: number;
  nowFactory?: () => Date;
  logger?: SeerHttpLogger;
  queryOptions?: QueryExecutionOptions;
  healthTimeoutMs?: number;
  healthProbe?: SeerHealthProbe;
  publicIdentityProvider?: SeerPublicIdentityProvider;
  releaseIdentity?: unknown;
  requireReleaseIdentity?: boolean;
  artifactMode?: ArtifactMode;
  webRoot?: string;
  clientDir?: string;
}
export type SeerHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export function createSeerHttpHandler(options?: SeerHttpHandlerOptions): SeerHttpHandler;
export { createSeerHttpServer, listen } from './server.js';
export type { SeerHttpServerOptions } from './server.js';
