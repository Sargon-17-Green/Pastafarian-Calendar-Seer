# API Stage 6 ׳³ֲ³׳’ג‚¬ג„¢׳³ג€™׳’ג‚¬ֲײ²ֲ¬׳³ג€™׳’ג€ֲ¬ײ²ֲ deployment and application integration

Stage 6 packages the already-verified v1 query and HTTP layers without changing their semantics.
The npm package name is `pastafarian-calendar-seer`; it is ESM-only and has no npm runtime dependencies.
Its npm metadata declares Node `>=20` on x64 Linux or x64 Windows. `npm run build:native` detects AVX2 at build time and otherwise selects the exact portable scalar RNS backend.

## Node application API

```js
import {
  queryDate,
  queryNow,
  queryBatch,
  queryRange,
  queryCalculationDay,
  queryYear,
} from 'pastafarian-calendar-seer';

const answer = await queryDate({
  target: { gregorian: '2026-09-15' },
});
```

The same functions remain available from `pastafarian-calendar-seer/query`. The root export is the
stable application-facing path; consumers do not need to import repository-internal files.

## Embedded HTTP server

```js
import { listen } from 'pastafarian-calendar-seer/http';

const server = await listen({ host: '127.0.0.1', port: 8080 });
```

`createSeerHttpHandler()` and `createSeerHttpServer()` are exported from the same subpath for hosts
that own their HTTP lifecycle. All routes and errors are still the frozen v1 contract implemented by
`http/app.mjs`; Stage 6 adds no transport semantics.
## Command line

After installation, npm exposes two executables:

```text
pastafarian-seer [date|now|calculation-day|range|year|batch] ...
pastafarian-seer-http
```

The first executable is the existing Stage 3 CLI. The second launches the existing Stage 4 HTTP
server. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `8080`.

## Exact native runtime

The rolling generated cache is bundled, but public semantics are not limited to its 366-target-day
window. Exact cache misses and complete years use the native engines introduced by Stage 5 and the
persistent service adopted in OPT-06.

Run the same command on every supported platform:

```text
npm run build:native
```

On Linux/WSL the dispatcher uses Bash and a GCC-compatible C++20 toolchain. On native Windows it uses
PowerShell and `g++`; the supported setup is MSYS2 UCRT64 with `mingw-w64-ucrt-x86_64-gcc`,
`mingw-w64-ucrt-x86_64-gmp`, and `mingw-w64-ucrt-x86_64-boost`. The UCRT64 `bin` directory must be on
`PATH` while the generated executables run, so their GMP/GCC/OpenMP runtime DLLs are resolvable.

Both build paths select AVX2 automatically when the CPU exposes it and otherwise compile the exact portable scalar RNS backend. Set `SEER_RNS_BACKEND=avx2` or `portable` to force a backend; forcing AVX2 on an unsupported CPU fails explicitly. The Windows dispatcher honors `CXX` for a specific compiler and `SEER_POWERSHELL` for a non-default PowerShell executable.

This builds, in the package's `prototype/build/` directory (`.exe` suffix on Windows):

- `seer_year_batch`;
- `seer_year_locator`;
- `seer_year_structure`;
- `seer_engine_service`.

The build does not download runtime JavaScript dependencies and does not alter API data.

## Installed-package self-test

`npm test` is intentionally a package self-test: it exercises a bundled-cache `queryDate()` call, the
packaged Venus day-boundary model, and an HTTP loopback without requiring the native toolchain.
`npm run validate:cache` verifies bundled cache shape/checksums; in a source checkout it additionally checks
the scheduled cache workflow. Repository maintainers use `npm run test:repo` for the full source-tree suites.
CI also invokes both installed command shims from `node_modules/.bin`.

## Persistent service policy

By default `query/exact-engine.mjs` prefers `seer_engine_service` and retains the Stage 5 process
fallbacks for compatibility. A deployment that must prove it is exercising the OPT-06 persistent
runtime should set:

```text
SEER_REQUIRE_ENGINE_SERVICE=1
```

With that flag, absence or failure of the persistent service is `SEER_UNAVAILABLE`; the runtime will
not silently fall back to one-process-per-call exact executables.

Advanced deployments may override binary locations with the existing environment variables
`SEER_ENGINE_SERVICE_BIN`, `SEER_YEAR_BATCH_BIN`, `SEER_YEAR_LOCATOR_BIN`, and
`SEER_YEAR_STRUCTURE_BIN`. The native data directory remains the packaged `prototype/data` by
default, so both `gates_u16.bin` and `gates_negative_u16.bin` are resolved from the packaged data directory.

## Packaging boundary

`npm pack` intentionally includes the query/HTTP runtime, the two published OpenAPI documents, the
three rolling cache files plus their index, the cache loader/validator and Venus boundary model, the exact
ten-file native runtime source closure, both gate-corpus binaries, and the exact-runtime build scripts. It excludes
API schemas/examples/tests, cache-generation helpers, research/benchmark source variants, GitHub workflows,
repository repair artifacts, benchmark result directories, and every `HANDOFF_*` file.

The Stage 6 CI installs the packed tarball in a fresh consumer project before testing it. This catches
missing package files and deep relative-import assumptions that repository-local tests cannot catch.

Reverse conversion was added after Stage 6 through the shared query/HTTP layer. Localization beyond the existing English presentation is not added
by this stage. Those are separate product capabilities, not deployment prerequisites.
