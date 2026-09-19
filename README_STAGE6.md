# Pastafarian Calendar Seer — API Stage 6

Stage 6 turns the verified query/HTTP stack into an installable Node ESM deployment package.
It does not add calendar rules, routes, response fields, locales, or reverse conversion.

Stable package entry points:

- `pastafarian-calendar-seer` — shared query API;
- `pastafarian-calendar-seer/client` — browser-safe fetch client for the HTTP v1 service;
- `pastafarian-calendar-seer/http` — HTTP handler/server/listener;
- `pastafarian-seer` — existing query CLI;
- `pastafarian-seer-http` — existing HTTP v1 server.

The package has zero npm runtime dependencies and declares Node `>=20`. Installation itself is not
OS/CPU-gated so the browser HTTP client can be consumed from any npm-supported development host.
Local exact operation requires the native C++ runtime and its
existing GCC-compatible C++20, GMP/GMPXX and Boost requirements. Build it after install with `npm run build:native`; the build selects the AVX2 RNS backend when available and otherwise uses the exact portable scalar backend.
The command dispatches to Bash on Linux/WSL and PowerShell on native Windows.

`npm test` verifies the query adapter with a deterministic fixture provider, the packaged Venus day-boundary model, and an HTTP loopback without requiring rolling cache data or the native runtime.
Rolling cache data is maintained outside the package; see `docs/ROLLING_CACHE.md`. CI additionally invokes both installed command shims.

Production deployments that require the persistent OPT-06 service rather than compatibility fallbacks
should set `SEER_REQUIRE_ENGINE_SERVICE=1`.

The Stage 6 verifier packs the repository, installs that tarball into clean Linux and Windows consumers,
runs package validation, builds the native runtime, exercises the public package/CLI/HTTP entry points,
and proves repeated exact requests reuse one persistent service process.

See `docs/DEPLOYMENT_STAGE6.md` for examples and deployment details.
