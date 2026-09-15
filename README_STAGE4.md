# Pastafarian Calendar Seer — Stage 4

Stage 4 adds the HTTP v1 adapter on top of the verified Stage 3 query layer.

It adds no independent calendar implementation. All date, batch, range, calculation-day and year operations delegate to `query/index.mjs`.

Run:

```text
node http/server.mjs
```

The adapter provides strict GET/POST parsing, request-size limits, CORS, stable HTTP error mapping, OpenAPI serving, readiness, and JSON/NDJSON/CSV range serialization.
