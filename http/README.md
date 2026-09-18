# Seer HTTP adapter — Stage 4

This directory exposes the existing shared query layer over HTTP. It contains no calendar algorithm.

Start locally:

```bash
node http/server.mjs
```

Defaults: `HOST=127.0.0.1`, `PORT=8080`.

Public routes follow `api/openapi.yaml`: `/v1/now`, `/v1/date`, `/v1/batch`, `/v1/range`, `/v1/reverse`, `/v1/year/{year}`, `/v1/calculation-day`, `/v1/locales`, `/v1/meta`, `/v1/status`, `/openapi.json`, and `/openapi.yaml`.

The request instant is captured once by the HTTP adapter and passed to the shared query layer. CORS is enabled for public read/query use without credentials.

OpenAPI's relative JSON Schema references are served under `/schemas/*.schema.json`, so the published contract can be resolved directly by HTTP tooling.
