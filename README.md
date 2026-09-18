# Pastafarian Calendar — Seer

> **The Monster performs. The Seer sees.**

The **Seer** is a high-performance engine and public API for the Pastafarian Calendar. It exposes the calendar through a stable Node API, browser/remote HTTP client, CLI, HTTP v1 service, OpenAPI contract, and verified Linux container deployment on amd64 and ARM64.

The Seer is **not normative**. The current Scroll defines the calendar; if the Seer disagrees with it, the Seer is wrong. The Seer is deliberately allowed to use precomputation, algebraic shortcuts, specialized integer representations, SIMD, and other optimizations instead of reenacting the Monster's liturgy.

## Install

Install the current public release from npm:

```bash
npm install pastafarian-calendar-seer
```

For a version-pinned install:

```bash
npm install pastafarian-calendar-seer@X.Y.Z
```

The same npm-format tarball is attached to the matching immutable GitHub Release as `pastafarian-calendar-seer-X.Y.Z.tgz`; its SHA-256, SBOMs, provenance, container digest, and cross-channel verification procedure are documented in [Supply-chain verification](docs/SUPPLY_CHAIN.md).

The package is ESM-only, requires Node `>=20`, has no npm runtime dependencies, and is not install-time OS/CPU gated.

For source development instead:

```bash
git clone https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer.git
cd Pastafarian-Calendar-Seer
npm test
npm run validate:cache
```

### When do I need the native runtime?

The package includes a rolling precomputed cache, so covered `queryDate()`, `queryNow()`, batch, and range requests can work immediately after installation.

Build the exact native runtime when you need any of the following:

- a date outside the bundled rolling cache;
- a complete Pastafarian year via `queryYear()`;
- reverse conversion via `queryReverse()`;
- a service that must provide exact cache-miss fallback rather than return `SEER_UNAVAILABLE`.

From an installed dependency:

```bash
npm explore pastafarian-calendar-seer -- npm run build:native
```

From a source checkout:

```bash
npm run build:native
```

The exact native runtime is verified on x64 Linux/WSL, ARM64 Linux, and x64 Windows. See [Native runtime and deployment](#native-runtime-and-deployment).

## 30-second Node example

```js
import { queryDate } from 'pastafarian-calendar-seer';

const result = await queryDate({
  calculation: { jdn: '2461302' },
  target: { gregorian: '2026-09-20' },
  presentation: 'canonical',
  include: ['structure', 'resolution'],
});

console.log(result);
```

At v0.1.2 this returns the following canonical shape for that request:

```json
{
  "calculationDay": { "jdn": "2461302" },
  "targetDay": {
    "jdn": "2461304",
    "gregorian": { "era": "CE", "year": "2026", "month": 9, "day": 20 }
  },
  "pastafarianDate": {
    "year": "5000",
    "cutlet": { "canonicalIndex": 5, "day": 351 },
    "month": { "canonicalIndex": 33, "day": 69 }
  },
  "structure": { "cutletCount": 7, "monthCount": 43 },
  "resolution": {
    "calculationSource": "explicit-jdn",
    "targetSource": "gregorian"
  }
}
```

Use `presentation: 'full'` (the default) if you also want the current English names and a formatted string.

## Core concepts

### Calculation day and target day are different inputs

Every conversion is evaluated under a **calculation day** and asks about a **target day**.

- **Calculation day** — the day whose Seer state controls the mapping.
- **Target day** — the day you want converted to a Pastafarian date.

Do not assume that converting the same target under two different calculation days must produce the same Pastafarian date.

If `calculation` is omitted, the Seer captures the request instant once and resolves the active calculation day from that instant and the observer longitude. If `target` is omitted, the target defaults to that resolved calculation day.

For reproducible programmatic work, prefer an explicit calculation JDN:

```js
{ calculation: { jdn: '2461302' } }
```

For live/current behavior, omit it or supply an RFC 3339 timestamp:

```js
{ calculation: { at: '2026-09-18T08:00:00Z' } }
```

Timestamps must include `Z` or an explicit UTC offset.

### Exact integers

JDNs, years, offsets, and other potentially unbounded integers accept either:

- a JSON integer inside the IEEE-754 safe range; or
- a canonical decimal string of arbitrary magnitude.

Prefer strings in application code:

```js
{ target: { jdn: '-13337246' } }
{ calculation: { jdn: '2461302' } }
```

Unbounded integer values in responses are returned as decimal strings.

### Target selectors

A target selector must contain **exactly one** of:

```js
{ target: { jdn: '2461304' } }
{ target: { gregorian: '2026-09-20' } }
{ target: { offsetDays: '2' } }
```

`offsetDays` is relative to the resolved calculation day.

The short Gregorian string form is CE-only and uses `YYYY-MM-DD`. For BCE or arbitrarily large years, use the structured proleptic Gregorian form:

```js
{
  target: {
    gregorian: { era: 'BCE', year: '762', month: 6, day: 7 }
  }
}
```

### Observer

The default observer preset is `kisurra`.

The only v1 observer fields that can affect the calendar are:

- `preset`;
- `longitude` in degrees, east-positive, normalized to `[-180, 180)`.

Example:

```js
{ observer: { longitude: 35.2137 } }
```

`latitude` and `elevationMeters` exist only as documented compatibility no-ops and are ignored.

### Presentation and optional fields

The default presentation is `full` with locale `en`.

```js
{ presentation: 'full', locale: 'en' }
{ presentation: 'canonical' }
```

`canonical` omits human-language names and formatting. It is the safest form for machine-to-machine use.

For date/reverse requests, `include` may contain:

- `structure`
- `boundaries`
- `provenance`
- `resolution`

Example:

```js
{
  include: ['structure', 'provenance', 'resolution']
}
```

For `queryYear()`, supported includes are `days`, `provenance`, and `resolution`.

## Node API

Import the stable application API from the package root:

```js
import {
  queryDate,
  queryNow,
  queryBatch,
  queryRange,
  queryReverse,
  queryCalculationDay,
  queryYear,
  SeerQueryError,
  gregorianToJdn,
  jdnToGregorian,
} from 'pastafarian-calendar-seer';
```

The same query functions are also available from `pastafarian-calendar-seer/query`.

### `queryDate(request)`

Resolve one target day.

```js
const result = await queryDate({
  calculation: { jdn: '2461302' },
  target: { gregorian: '2026-09-20' },
  presentation: 'canonical',
});
```

If both `calculation` and `target` are omitted, the request resolves the Pastafarian date of the current calculation day.

### `queryNow(options)`

Convenience wrapper for the current request instant.

```js
const now = await queryNow({
  presentation: 'canonical',
  include: ['resolution'],
});
```

The current instant is captured once for the request.

### `queryCalculationDay(request)`

Resolve which calculation JDN is active at an instant and longitude.

```js
const calculation = await queryCalculationDay({
  at: '2026-09-18T08:00:00Z',
  observer: { longitude: 35.2137 },
  include: ['boundaries'],
});
```

A response has the form:

```json
{
  "at": "2026-09-18T08:00:00.000Z",
  "jdn": "…",
  "observer": { "longitude": 35.2137 },
  "boundaries": {
    "startsAt": "…",
    "endsAt": "…"
  }
}
```

### `queryRange(request)`

Resolve a deterministic sequence of target days.

Use exactly one of `count` or `endInclusive`.

```js
const range = await queryRange({
  calculation: { jdn: '2461302' },
  start: { gregorian: '2026-09-20' },
  count: '3',
  stepDays: '1',
  calculationMode: 'fixed',
  presentation: 'canonical',
});
```

The response is:

```js
{
  results: [ /* ordinary queryDate() responses */ ]
}
```

Defaults:

- `stepDays: 1`
- `calculationMode: 'fixed'`

With `calculationMode: 'fixed'`, every target is evaluated under the same calculation day.

With `calculationMode: 'same-as-target'`, each target JDN is also used as that item's calculation JDN.

An inclusive end can be used instead of count:

```js
const range = await queryRange({
  calculation: { jdn: '2461302' },
  start: { jdn: '2461304' },
  endInclusive: { jdn: '2461308' },
  stepDays: '2',
  presentation: 'canonical',
});
```

The end must be reachable exactly using `stepDays`.

### `queryBatch(request)`

Resolve many independent date queries while capturing the request instant only once.

```js
const batch = await queryBatch({
  defaults: {
    calculation: { jdn: '2461302' },
    presentation: 'canonical',
  },
  queries: [
    { id: 'first', target: { gregorian: '2026-09-20' } },
    { id: 'second', target: { offsetDays: '10' } },
  ],
});
```

Each item succeeds or fails independently:

```js
{
  results: [
    { id: 'first', ok: true, result: { /* DateResponse */ } },
    { id: 'second', ok: false, error: { code, message, field?, details? } },
  ]
}
```

Batch IDs, when supplied, must be unique. The default implementation limit is 10,000 items.

### `queryYear(year, request)`

Return the exact structure of one Pastafarian year under a resolved calculation day.

```js
const year = await queryYear('5000', {
  calculation: { jdn: '2461302' },
  presentation: 'canonical',
  include: ['provenance'],
});
```

The response includes:

- year number;
- total length in days;
- start and end JDN;
- ordered cutlets with canonical index, length and offsets;
- ordered months with canonical index and length.

Request `include: ['days']` to include every target day and Pastafarian date in the year:

```js
const yearWithDays = await queryYear('5000', {
  calculation: { jdn: '2461302' },
  presentation: 'canonical',
  include: ['days'],
});
```

This can be a large response.

`queryYear()` requires the exact native runtime; the rolling cache is not a complete fixed-calculation-day year source.

### `queryReverse(request)`

Convert a complete Pastafarian date back to its target Gregorian/JDN day.

Reverse conversion requires the complete canonical tuple:

- `year`
- `cutlet.canonicalIndex`
- `cutlet.day`
- `month.canonicalIndex`
- `month.day`

Example:

```js
const target = await queryReverse({
  calculation: { jdn: '2461302' },
  pastafarianDate: {
    year: '5000',
    cutlet: { canonicalIndex: 5, day: 351 },
    month: { canonicalIndex: 33, day: 69 },
  },
  presentation: 'canonical',
});
```

The Seer does not trust only one coordinate system: it locates the year/cutlet/day target and then cross-checks the supplied month/day against the actual resolved date. Contradictory coordinates fail instead of silently choosing one.

Reverse conversion requires the exact native runtime.

### Gregorian helpers

The package also exports:

```js
const jdn = gregorianToJdn('2026-09-20');
const date = jdnToGregorian(jdn);
```

These helpers use the proleptic Gregorian calendar and the same exact-integer conventions as the query API.

## Browser and remote HTTP client

For applications that should talk to a running Seer service rather than execute the engine locally:

```js
import {
  createSeerClient,
  SeerClientError,
} from 'pastafarian-calendar-seer/client';

const seer = createSeerClient('https://seer.example');

const result = await seer.queryDate({
  target: { gregorian: '2026-09-20' },
  presentation: 'canonical',
});
```

For same-origin browser deployment:

```js
const seer = createSeerClient('');
```

The client uses only standard Web APIs (`fetch`, `Response`, and `URLSearchParams`) and imports no Node built-ins.

Available client methods:

```text
queryDate(request)
queryNow(request?)
queryBatch(request)
queryRange(request)
queryReverse(request)
queryCalculationDay(request?)
queryYear(year, request?)
getLocales()
getMeta()
getStatus()
getOpenApi()
```

You can inject a custom fetch implementation:

```js
const seer = createSeerClient('https://seer.example', {
  fetch: myFetch,
});
```

See `examples/browser/` for a no-build runnable browser example.

## Web application

A production no-build web application is available under `web/`. It uses the existing `pastafarian-calendar-seer/client` transport layer and delegates all calendar semantics to HTTP v1; it does not implement a second calendar engine in the browser.

The same files support both deployment styles:

- **same-origin container** — the repository image serves the UI at `/web/`, the browser client at `/client/index.mjs`, and the API at `/v1/*`;
- **separate static site** — publish `web/` together with `client/` and configure the remote API base through `web/config.js`, `?apiBase=...`, or the connection control in the UI.

The application includes current/date/JDN/offset queries, explicit calculation-day controls, observer longitude, reverse conversion, year structure, ranges, readiness diagnostics, structured error details, raw JSON, responsive layouts, and shareable primary query state. `include=days` remains opt-in.

See [`docs/WEB_APPLICATION.md`](docs/WEB_APPLICATION.md) for deployment, security, configuration, and E2E details.

## HTTP API

### Start the server

From a source checkout:

```bash
npm run build:native   # recommended for exact cache-miss support
npm start
```

From an installed dependency, you may use the installed command:

```bash
npx pastafarian-seer-http
```

Defaults:

```text
HOST=127.0.0.1
PORT=8080
```

For a network/container service, bind explicitly:

```bash
HOST=0.0.0.0 PORT=8080 pastafarian-seer-http
```

Set `SEER_REQUIRE_ENGINE_SERVICE=1` if startup/query behavior must require the persistent exact native engine instead of allowing compatibility fallbacks.

### Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/now` | Current Pastafarian date |
| GET / POST | `/v1/date` | One date query |
| POST | `/v1/batch` | Independent date queries |
| POST | `/v1/range` | Deterministic target sequence |
| GET | `/v1/year/{year}` | Exact year structure |
| POST | `/v1/reverse` | Pastafarian date → target day |
| GET | `/v1/calculation-day` | Resolve active calculation day |
| GET | `/v1/locales` | Supported presentation locales |
| GET | `/v1/meta` | v1 capability metadata |
| GET | `/v1/status` | Service readiness |
| GET | `/openapi.json` | OpenAPI 3.1 JSON |
| GET | `/openapi.yaml` | OpenAPI 3.1 YAML |

The service also exposes referenced JSON Schemas under `/schemas/*.schema.json`.

CORS is enabled for public query use without credentials.

### `curl`: current date

```bash
curl -sS 'http://127.0.0.1:8080/v1/now?presentation=canonical'
```

### `curl`: Gregorian target with explicit calculation JDN

GET form:

```bash
curl -sS \
  'http://127.0.0.1:8080/v1/date?target=2026-09-20&calculationJdn=2461302&presentation=canonical&include=structure,resolution'
```

Structured POST form:

```bash
curl -sS \
  -H 'content-type: application/json' \
  -H 'accept: application/json' \
  --data '{
    "calculation": { "jdn": "2461302" },
    "target": { "gregorian": "2026-09-20" },
    "presentation": "canonical",
    "include": ["structure", "resolution"]
  }' \
  http://127.0.0.1:8080/v1/date
```

### `curl`: range

```bash
curl -sS \
  -H 'content-type: application/json' \
  --data '{
    "calculation": { "jdn": "2461302" },
    "start": { "gregorian": "2026-09-20" },
    "count": "3",
    "presentation": "canonical"
  }' \
  http://127.0.0.1:8080/v1/range
```

`POST /v1/range` supports:

- `application/json`
- `application/x-ndjson`
- `text/csv`

through normal HTTP `Accept` negotiation.

### `curl`: reverse conversion

```bash
curl -sS \
  -H 'content-type: application/json' \
  --data '{
    "calculation": { "jdn": "2461302" },
    "pastafarianDate": {
      "year": "5000",
      "cutlet": { "canonicalIndex": 5, "day": 351 },
      "month": { "canonicalIndex": 33, "day": 69 }
    },
    "presentation": "canonical"
  }' \
  http://127.0.0.1:8080/v1/reverse
```

### `curl`: year structure

```bash
curl -sS \
  'http://127.0.0.1:8080/v1/year/5000?calculationJdn=2461302&presentation=canonical'
```

Add `include=days` only when you really need every day of the year.

## Date response anatomy

A normal date or reverse response contains:

| Field | Meaning |
| --- | --- |
| `calculationAt` | Present when the calculation day was resolved from an instant |
| `calculationDay.jdn` | Exact calculation JDN as a decimal string |
| `observer.longitude` | Present when observer information was relevant |
| `targetDay.jdn` | Exact target JDN as a decimal string |
| `targetDay.gregorian` | Proleptic Gregorian target date |
| `pastafarianDate.year` | Exact Pastafarian year as a decimal string |
| `pastafarianDate.cutlet.canonicalIndex` | Canonical cutlet index, 1–17 |
| `pastafarianDate.cutlet.day` | 1-based day within that cutlet |
| `pastafarianDate.month.canonicalIndex` | Canonical month index, 1–47 |
| `pastafarianDate.month.day` | 1-based day within that month |
| `locale`, `formatted` | Present in `full` presentation |
| `structure` | Present when requested |
| `boundaries` | Present when requested |
| `provenance` | Present when requested |
| `resolution` | Present when requested |

When `presentation: 'full'` is used, cutlet and month objects also contain their English `name`.

The `resolution` object is useful for debugging defaults. It records how the calculation day, target, and observer were selected.

## HTTP GET parameter mapping

For `GET /v1/date`:

| Query parameter | Structured equivalent |
| --- | --- |
| `target=YYYY-MM-DD` | `target.gregorian` |
| `targetJdn=...` | `target.jdn` |
| `offsetDays=...` | `target.offsetDays` |
| `calculationAt=...` | `calculation.at` |
| `calculationJdn=...` | `calculation.jdn` |
| `observer=kisurra` | `observer.preset` |
| `longitude=...` | `observer.longitude` |
| `locale=en` | `locale` |
| `presentation=full|canonical` | `presentation` |
| `include=a,b,c` | `include: ['a','b','c']` |

Use only one target selector and only one calculation selector.

`GET /v1/now` accepts observer/presentation/include parameters but no target selector.

`GET /v1/year/{year}` accepts calculation/observer/presentation parameters and `include=days,provenance,resolution`.

`GET /v1/calculation-day` uses `at`, observer fields, and optionally `include=boundaries`.

## Errors

### Node

Query failures are `SeerQueryError` instances:

```js
import { queryDate, SeerQueryError } from 'pastafarian-calendar-seer';

try {
  await queryDate({
    calculation: { jdn: '2461302' },
    target: { jdn: 'not-an-integer' },
  });
} catch (error) {
  if (error instanceof SeerQueryError) {
    console.error(error.code);
    console.error(error.message);
    console.error(error.field);
    console.error(error.details);
  }
}
```

### Browser client

The HTTP client throws `SeerClientError`, which adds the HTTP status:

```js
try {
  await seer.queryDate({ target: { jdn: 'bad' } });
} catch (error) {
  if (error instanceof SeerClientError) {
    console.error(error.status, error.code, error.message);
  }
}
```

### HTTP

HTTP errors have one stable JSON envelope:

```json
{
  "error": {
    "code": "INVALID_LONGITUDE",
    "message": "Longitude must be between -180 and 180 degrees.",
    "field": "observer.longitude"
  }
}
```

Important status/code groups:

| HTTP | Typical codes | Meaning |
| ---: | --- | --- |
| 400 | `UNKNOWN_PARAMETER`, `AMBIGUOUS_TARGET`, `CONFLICTING_CALCULATION`, `UNSUPPORTED_INCLUDE` | Request shape/mode error |
| 406 | `LOCALE_NOT_SUPPORTED`, `NOT_ACCEPTABLE` | Unsupported locale or response representation |
| 413 | `REQUEST_TOO_LARGE` | Batch/body limit exceeded |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST body is not JSON |
| 422 | `INVALID_JDN`, `INVALID_GREGORIAN_DATE`, domain-range errors, reverse-coordinate errors | Syntactically valid request whose value cannot be resolved |
| 503 | `SEER_UNAVAILABLE` | Required provider/native runtime is unavailable |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

Important exact-domain codes are:

```text
CALCULATION_OUT_OF_SUPPORTED_DOMAIN
TARGET_OUT_OF_SUPPORTED_DOMAIN
YEAR_OUT_OF_SUPPORTED_DOMAIN
```

Reverse-specific validation can produce:

```text
INVALID_PASTAFARIAN_DATE
PASTAFARIAN_DATE_NOT_IN_YEAR
PASTAFARIAN_DATE_CONFLICT
```

Do not treat `SEER_UNAVAILABLE` as “invalid calendar date”; it means the configured Seer provider could not perform the requested operation.

## CLI

Installation exposes two commands:

```text
pastafarian-seer
pastafarian-seer-http
```

### Date

```bash
pastafarian-seer date \
  --calculation-jdn 2461302 \
  --target 2026-09-20 \
  --canonical \
  --include structure,resolution
```

Equivalent target selectors:

```text
--target YYYY-MM-DD
--target-jdn JDN
--offset-days N
```

Calculation selectors:

```text
--calculation-at RFC3339
--calculation-jdn JDN
```

Observer selectors:

```text
--longitude DEG
--preset kisurra
```

### Current date

```bash
pastafarian-seer now --canonical
```

### Calculation day

```bash
pastafarian-seer calculation-day \
  --at 2026-09-18T08:00:00Z \
  --longitude 35.2137 \
  --include boundaries
```

### Range

```bash
pastafarian-seer range \
  --calculation-jdn 2461302 \
  --start 2026-09-20 \
  --count 3 \
  --step-days 1 \
  --canonical
```

Use `--same-as-target` for the `same-as-target` calculation mode.

### Reverse

```bash
pastafarian-seer reverse \
  --calculation-jdn 2461302 \
  --year 5000 \
  --cutlet 5 \
  --day-in-cutlet 351 \
  --month 33 \
  --day-in-month 69 \
  --canonical
```

### Year

```bash
pastafarian-seer year 5000 \
  --calculation-jdn 2461302 \
  --canonical
```

### Batch

Put a structured batch request in `request.json`, then:

```bash
pastafarian-seer batch request.json
```

### HTTP server

```bash
pastafarian-seer-http
```

Use `HOST` and `PORT` to change the bind address.

## Native runtime and deployment

### Exact engine build

```bash
npm run build:native
```

This builds:

```text
prototype/build/seer_year_batch
prototype/build/seer_year_locator
prototype/build/seer_year_structure
prototype/build/seer_engine_service
```

(`.exe` is added on native Windows.)

On Linux/WSL the build uses a GCC-compatible C++20 toolchain with OpenMP, GMP/GMPXX, and Boost headers.

On native Windows the verified setup is MSYS2 UCRT64 with:

```text
mingw-w64-ucrt-x86_64-gcc
mingw-w64-ucrt-x86_64-gmp
mingw-w64-ucrt-x86_64-boost
```

The UCRT64 `bin` directory must remain on `PATH` when the generated executables run.

### Runtime backend selection

Default behavior:

- on amd64/x64, use AVX2 when the build host exposes it, otherwise use the exact portable scalar RNS backend;
- on Linux ARM64, use the exact portable scalar RNS backend;
- reject AVX2 explicitly on ARM64 because that backend is x86-only.

Force one:

```bash
SEER_RNS_BACKEND=portable npm run build:native
SEER_RNS_BACKEND=avx2 npm run build:native
```

Forcing AVX2 on an unsupported CPU fails explicitly.

Linux shell builds also accept an explicit architecture policy:

```bash
SEER_ARCH=amd64 SEER_RNS_BACKEND=portable npm run build:native
SEER_ARCH=arm64 SEER_RNS_BACKEND=portable npm run build:native
```

With `SEER_ARCH=auto`, the default remains `SEER_MARCH=native`. Explicit `amd64` defaults to the generic `x86-64` baseline; explicit `arm64` defaults to `armv8-a`. These explicit baselines are used by the verified container and architecture-conformance workflows.

### Persistent service policy

The application API prefers the persistent `seer_engine_service` and retains one-process-per-call exact executables as compatibility fallbacks.

To require the persistent service:

```bash
SEER_REQUIRE_ENGINE_SERVICE=1
```

With this flag, persistent-service absence/failure becomes `SEER_UNAVAILABLE` rather than silently selecting a compatibility path.

Advanced binary overrides:

```text
SEER_ENGINE_SERVICE_BIN
SEER_YEAR_BATCH_BIN
SEER_YEAR_LOCATOR_BIN
SEER_YEAR_STRUCTURE_BIN
```

### Container

The verified Linux image path builds the exact portable backend for both `linux/amd64` and `linux/arm64` using explicit generic CPU targets.

```bash
docker build -t pastafarian-calendar-seer:local .
docker run --rm -p 8080:8080 pastafarian-calendar-seer:local
```

The image:

- runs as a non-root user;
- binds `0.0.0.0:8080`;
- sets `SEER_REQUIRE_ENGINE_SERVICE=1`;
- includes a `/v1/status` healthcheck;
- is CI-tested natively on amd64 and ARM64 with exact negative-gate-domain HTTP, reverse, and year queries;
- has a Buildx path that produces one OCI multi-architecture layout containing `linux/amd64` and `linux/arm64`.

See `docs/CONTAINER_DEPLOYMENT.md`.

## OpenAPI and JSON Schema reference

The formal HTTP contract is OpenAPI 3.1:

```text
api/openapi.yaml
api/openapi.json
```

From a running service:

```text
GET /openapi.yaml
GET /openapi.json
```

Every relative schema reference is resolvable from the service under:

```text
/schemas/*.schema.json
```

The npm package exposes the same schema files through:

```text
pastafarian-calendar-seer/schemas/*
```

Use the OpenAPI/JSON Schema files as the machine-readable reference. This README is the human usage guide.

## Correctness contract

The Seer is **not normative**.

- The current Scroll defines what is true.
- The historical spaghetti implementation (the **Monster**) performs the prescribed work.
- The **Seer** is an accelerated implementation that predicts the same answer without reproducing the same computational history.
- Test-only exact/reference oracles are verification tools, not authorities over the Scroll.
- Agreement between multiple Seer implementations is not enough when they may share a common bug.

If the Seer disagrees with the normative calendar, **the Seer is wrong**.

### Canonical saved-sum correction — 2026-09-10

The 12 final Sauce post-stirs use `R = SAVE(sum(oldBowls) + 149*r)` both to choose the bowl permutation and as the additive sum term inside `u`. All six new bowls in a stir read one common old-bowl snapshot.

The former v3/v12 paths incorrectly used the raw old-bowl sum inside `u`; that common-mode error and all derived semantic witnesses are superseded. See `docs/CONFORMANCE.md`, `docs/DATA_PROVENANCE.md`, and `HISTORICAL_VALIDATION_NOTICE.md`.

Corrected positive 40,000-gap corpus SHA-256:

```text
2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb
```

Canonical negative 40,000-gap corpus SHA-256:

```text
90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab
```

## Current state and limitations

The repository contains:

- a verified shared Node query API;
- CLI;
- HTTP v1 adapter;
- browser/remote fetch client;
- rolling generated cache;
- exact cache-miss and full-year native provider;
- persistent OPT-06 engine service;
- bidirectional positive/negative gate support;
- reverse conversion;
- runnable no-build browser example;
- verified amd64 and ARM64 Linux container deployment;
- reproducible GitHub package releases.

Known limitations:

- the exact engine has a finite bundled gate horizon;
- presentation is currently English-only;
- exact out-of-cache execution requires the native toolchain/runtime;
- Windows ARM64 and macOS native exact-runtime support are not currently verified;
- public npm-registry publication is not configured yet.

The public Node/HTTP contract is stable at v1; this does not make the Seer normative.

## Package self-test and cache validation

Installed package self-test:

```bash
npm test
```

It exercises the bundled-cache query path, Venus day-boundary model, HTTP loopback, browser client, and the packaged OpenAPI schema closure without requiring the native toolchain.

Validate generated cache data:

```bash
npm run validate:cache
```

Repository maintainers use:

```bash
npm run test:repo
```

for the full source-tree suites.

## Prototype build and conformance

For benchmark/prototype work on Linux/WSL, run the semantic gate before treating benchmark output as meaningful:

```bash
cd prototype
bash ./scripts/check_saved_sum_conformance.sh
bash ./scripts/build_portable.sh
bash ./scripts/run_portable_selftest.sh 1
bash ./scripts/check_portable_vectors.sh
bash ./scripts/run_benchmark_portable.sh 3
```

The portable and IFMA benchmark backends require a GCC-compatible C++20 environment with OpenMP, GMP/GMPXX, and Boost headers. The IFMA baseline additionally requires AVX-512F/DQ/BW/VL + AVX-512IFMA.

See `prototype/STATUS.md`, `prototype/README.md`, `docs/PORTABLE_BACKEND.md`, and `ROADMAP.md`.

## Repository map

```text
api/                  OpenAPI, JSON Schemas, semantic rules and contract fixtures
client/               browser-safe HTTP client
docs/                 architecture, deployment, conformance and data provenance
examples/browser/     no-build browser integration example
generated/            rolling generated cache
http/                 HTTP v1 adapter/server
precompute/           cache lookup, validation and boundary support
prototype/            exact/native engine, data and benchmark lineage
query/                shared semantic query layer and CLI
scripts/              package/native build and self-test entry points
Dockerfile            verified amd64/ARM64 Linux service image
ROADMAP.md             remaining product work
LICENSE                MIT license
NOTICE.md              liturgical non-authorization notice
```

## Related project

The Seer exists beside, not inside, the Pastafarian Calendar's spaghetti history.

`Sargon17-Green/Pastafarian-Calendar` contains the specification/historical implementations and independent language branches. The separation is intentional. Optimizing the Seer must not clean up, rewrite, or silently bypass the liturgical history preserved by the Monster.

R'amen.


## Supply-chain verification

The `v0.1.2` GitHub tarball can be checked against its published SHA-256 file. The repository is prepared for subsequent hardened releases with SHA-pinned Actions, OIDC npm publishing, GHCR digest publication, SBOMs, GitHub attestations, immutable GitHub Releases, and a machine-readable release manifest. See [docs/SUPPLY_CHAIN.md](docs/SUPPLY_CHAIN.md) for the exact verification model and commands. Provenance establishes build origin and artifact integrity; it is not evidence of calendar-semantic correctness.
