# API HTTP layer — Stage 4

Stage 4 turns the Stage 3 shared query functions into a dependency-free Node HTTP service.

## Architectural rule

The HTTP layer parses transport syntax only. Calendar semantics remain in `query/index.mjs`; the server never computes a Pastafarian date itself.

## Routes

- `GET /v1/now`
- `GET|POST /v1/date`
- `POST /v1/batch`
- `POST /v1/range`
- `GET /v1/year/{year}`
- `GET /v1/calculation-day`
- `GET /v1/locales`
- `GET /v1/meta`
- `GET /v1/status`
- `GET /openapi.json`
- `GET /openapi.yaml`

## Transport rules

- One wall-clock instant is captured at the beginning of each HTTP request.
- POST bodies require `application/json` and are limited to 1 MiB by default.
- Unknown and effective duplicate GET parameters are rejected; documented no-op latitude/elevation parameters are simply discarded.
- Ordinary responses are JSON. Range additionally supports NDJSON and CSV through `Accept`.
- Errors never expose stack traces or provider internals.
- CORS uses `Access-Control-Allow-Origin: *` and does not enable credentials.
- Dynamic answers use `Cache-Control: no-store`; OpenAPI and static capability metadata may be cached briefly.

## Readiness

`/v1/status` returns `ok` only if the configured query provider can answer the default current-date query. A process that is alive but cannot guarantee a current answer returns HTTP 503 with `{"status":"unavailable"}`.

## Current provider chain

The rolling precomputed provider still cannot answer complete fixed-calculation-day year structures by itself. The current production query chain falls through to the Stage 5/OPT-06 exact native provider, so `/v1/year/{year}` is exact when the native runtime is available. HTTP 503/`SEER_UNAVAILABLE` therefore indicates provider/runtime unavailability, not an intentional lack of year-query support.
