# Pastafarian Calendar Seer ג€” API Stage 6

Stage 6 turns the verified query/HTTP stack into an installable Node ESM deployment package.
It does not add calendar rules, routes, response fields, locales, or reverse conversion.

Stable package entry points:

- `pastafarian-calendar-seer` ג€” shared query API;
- `pastafarian-calendar-seer/http` ג€” HTTP handler/server/listener;
- `pastafarian-seer` ג€” existing query CLI;
- `pastafarian-seer-http` ג€” existing HTTP v1 server.

The package has zero npm runtime dependencies. Exact out-of-cache operation still requires the
native C++ runtime and its existing GMP/GMPXX, Boost and AVX2 requirements. Build it after install
with `npm run build:native` inside the installed package (or before deployment in an image).
The command dispatches to Bash on Linux/WSL and PowerShell on native Windows; Windows builds use a
matching MSYS2/MinGW GCC + GMP/GMPXX + Boost toolchain and require AVX2.

Production deployments that require the persistent OPT-06 service rather than compatibility
fallbacks should set `SEER_REQUIRE_ENGINE_SERVICE=1`.

The Stage 6 verifier packs the repository, installs that tarball into a clean consumer directory,
builds the native runtime there, imports the public package entry points, performs out-of-cache
query and HTTP requests with the persistent service required, and proves repeated requests reuse
one service process. Full repository and API-contract regressions then run unchanged.

See `docs/DEPLOYMENT_STAGE6.md` for examples and deployment details.
