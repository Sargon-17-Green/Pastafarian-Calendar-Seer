# Production web application

The repository contains a no-build production web client under `web/`. It is intentionally a thin UI over the existing browser-safe `client/index.mjs` and the HTTP v1 API. It does not implement Gregorian/JDN conversion, Pastafarian calculations, reverse mathematics, observer boundaries, or Seer error classification.

## Supported UI

The application exposes:

- current/live Pastafarian date;
- Gregorian, JDN, and `offsetDays` date queries;
- live, explicit-JDN, and explicit-instant calculation-day selection;
- Kisurra and custom-longitude observer selection;
- full and canonical presentation, with locale discovery from `/v1/locales`;
- reverse conversion using the complete canonical tuple;
- year structure, with `include=days` only after explicit opt-in;
- range queries using count or `endInclusive`, step, and fixed or same-as-target calculation mode;
- readiness plus `/v1/meta` and `/v1/locales` diagnostics;
- raw request/response transport details and structured API errors.

The year view does not synthesize fields that HTTP v1 does not expose. In particular, cutlet offsets are displayed from `YearResponse`; month offsets are shown as unavailable rather than recomputed in the browser.

The locale selector is populated from `/v1/locales`; the web application does not bundle translations. It sends only the selected locale code to HTTP v1. Returned formatted text uses the locale metadata `direction` for rendering, while canonical presentation disables the locale control because locale is semantically irrelevant there.

## API base configuration

Configuration precedence at page load is:

1. `?apiBase=...` in the page URL;
2. `globalThis.SEER_WEB_CONFIG.apiBase` from `web/config.js`;
3. the empty string, meaning same origin.

The UI also permits changing the API base at runtime. Accepted values are an empty string, an origin-relative path, or an HTTP(S) URL. URLs containing credentials are rejected.
For a same-origin service:

```js
globalThis.SEER_WEB_CONFIG = Object.freeze({
  apiBase: '',
});
```

For a static site using a remote Seer service:

```js
globalThis.SEER_WEB_CONFIG = Object.freeze({
  apiBase: 'https://seer.example',
});
```

The remote service must be reachable through HTTPS when the site itself is HTTPS. Seer HTTP v1 already returns public CORS headers and does not use credentials.

## Same-origin container deployment

The repository Docker image copies `web/` separately from the npm package and sets:

```text
SEER_WEB_ROOT=/opt/seer-web
```

The HTTP server then exposes:

```text
/                  -> 302 /web/
/web/              production application
/client/index.mjs  existing browser-safe Seer client
/v1/*              unchanged HTTP v1 API
/openapi.*          unchanged OpenAPI documents
/schemas/*          unchanged JSON Schemas
```

There is deliberately no SPA fallback. Missing static files remain 404 and can never consume API routes. The healthcheck remains `GET /v1/status`.

To build and run:

```bash
docker build -t pastafarian-calendar-seer:local .
docker run --rm -p 8080:8080 pastafarian-calendar-seer:local
```

Then open `http://127.0.0.1:8080/web/`.
## Separate static hosting

A static deployment needs both `web/` and `client/` with their repository-relative layout preserved, because `web/transport.mjs` imports the existing `../client/index.mjs`.

For example:

```bash
mkdir -p dist
cp -R web client dist/
python3 -m http.server 8000 --directory dist
```

Configure `dist/web/config.js` with the remote API URL before publishing, or supply `?apiBase=https%3A%2F%2Fseer.example`.

GitHub Pages is not enabled by this workstream. If Pages or another static host is enabled later, publish only the static `web/` and `client/` trees; the exact native runtime belongs on the separate Seer service.

## Shareable URL state

The application preserves the active mode plus the primary date target and calculation selector in the query string when practical. For example:

```text
/web/?mode=date&targetKind=gregorian&target=2026-09-20&calculationMode=jdn&calculation=2461302
```

The API base may also be represented by `apiBase`. Do not put secrets in this URL; the public client requires none.

## Error behavior

The UI preserves, when available:

- HTTP status;
- Seer error code;
- message;
- field;
- details.

`SEER_UNAVAILABLE` is rendered explicitly as an exact-operation/service availability failure and does not claim that the requested date is invalid. Network failures and server responses are displayed as separate categories.

The HTTP adapter also preserves `SeerQueryError.details` in the documented error envelope. This aligns the runtime response with `error-response.schema.json` and the existing `SeerClientError.details` field.
## Security and caching

The application contains no credentials, npm tokens, GitHub tokens, or API secrets. API-supplied values are inserted with text nodes/textContent rather than `innerHTML`.

Same-origin static HTML receives a Content Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and frame denial. `index.html` and `config.js` use revalidation-oriented caching; other static assets may be cached for one hour. API responses retain their existing `no-store` behavior.

## Testing

Fast tests cover:

- form-to-request mapping;
- exact-integer preservation;
- target-selector exclusivity;
- API-base normalization;
- response rendering inputs;
- structured error rendering;
- traced/injected fetch behavior;
- same-origin static serving;
- OpenAPI route drift.

The `Verify production web application` workflow also builds the real exact-runtime container and runs Chromium through Playwright. Its browser test covers readiness, current date, explicit Gregorian date, reverse conversion through the exact native runtime, invalid input, the `SEER_UNAVAILABLE` UX, year structure, range queries, a narrow mobile viewport, and cross-origin static-site configuration.

The production web app is repository/deployment material and is intentionally excluded from the npm package allowlist. Therefore adding or changing this UI alone does not require an npm package version bump.
