# API Stage 6 — deployment and application integration

Stage 6 packages the already-verified v1 query and HTTP layers without changing their semantics.
The npm package name is `pastafarian-calendar-seer`; it is ESM-only and has no npm runtime dependencies.
Its npm metadata declares Node `>=20` without an install-time OS/CPU gate, so the browser HTTP client can be installed on ordinary browser-development hosts. The exact native runtime is verified on x64 Linux/WSL, ARM64 Linux, and x64 Windows. `npm run build:native` rejects unsupported native platforms explicitly; Windows ARM64 and macOS native exact-runtime support are not implied by the browser-safe package.
Linux shell builds accept `SEER_ARCH`, `SEER_MARCH`, and `SEER_RNS_BACKEND`. `SEER_ARCH=auto` preserves the ordinary local `SEER_MARCH=native` behavior. Explicit `SEER_ARCH=amd64` defaults to the generic `x86-64` baseline, while `SEER_ARCH=arm64` defaults to `armv8-a` and requires the portable RNS backend. The verified container uses these explicit generic policies. See `CONTAINER_DEPLOYMENT.md`.

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

## Browser / remote HTTP client

`pastafarian-calendar-seer/client` is browser-safe and contains no Node runtime imports. It wraps the
public HTTP v1 routes with the same method names used by the application API where practical:

```js
import { createSeerClient } from 'pastafarian-calendar-seer/client';

const seer = createSeerClient('https://seer.example');
const answer = await seer.queryDate({ target: { gregorian: '2026-09-18' } });
```

Use `createSeerClient('')` for same-origin browser deployment. A custom `fetch` implementation may be
injected as the second argument for non-browser hosts.

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

On amd64 Linux and x64 Windows, automatic backend selection uses AVX2 when the host exposes it and otherwise compiles the exact portable scalar RNS backend. On ARM64 Linux, the exact runtime uses the portable backend; AVX2 is rejected as an x86-only request. Set `SEER_RNS_BACKEND=portable` to force the portable path on supported hosts. The Windows dispatcher honors `CXX` for a specific compiler and `SEER_POWERSHELL` for a non-default PowerShell executable.

This builds, in the package's `prototype/build/` directory (`.exe` suffix on Windows):

- `seer_year_batch`;
- `seer_year_locator`;
- `seer_year_structure`;
- `seer_engine_service`.

The build does not download runtime JavaScript dependencies and does not alter API data. ARM64 CI additionally installs the packed npm tarball in a clean consumer, rebuilds all four exact-runtime binaries there, and compares canonical date/range/year/reverse/error snapshots against amd64.

## Installed-package self-test

`npm test` is intentionally a package self-test: it exercises `queryDate()` through a deterministic fixture provider, the packaged Venus day-boundary model, and an HTTP loopback without requiring the native toolchain or rolling cache data.
Repository maintainers use `npm run test:repo` for the full source-tree suites. CI also invokes both installed command shims from `node_modules/.bin`.

Rolling cache data is an external performance artifact. Production may mount a verified cache-data snapshot read-only and set `SEER_CACHE_DIR`; release images remain immutable and work correctly with the exact engine when no cache is mounted.

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
default. Production resolves `gates_100k_u16.bin` and `gates_negative_100k_u16.bin`; the historical 40k files remain packaged as immutable provenance/compatibility fixtures.

## Packaging boundary

`npm pack` intentionally includes the query/HTTP runtime, the two published OpenAPI documents and
their complete JSON Schema reference closure, the three rolling cache files plus their index, the
cache loader/validator and Venus boundary model, the exact ten-file native runtime source closure,
both gate-corpus binaries, and the exact-runtime build scripts. It excludes API examples/tests,
cache-generation helpers, research/benchmark source variants, GitHub workflows, repository repair
artifacts, benchmark result directories, and every `HANDOFF_*` file. The package includes both historical 40k gate corpora and the two production 100k corpora; see `GATE_DOMAIN_EXTENSION.md`.

The Stage 6 CI installs the packed tarball in a fresh consumer project before testing it. This catches
missing package files and deep relative-import assumptions that repository-local tests cannot catch.

Reverse conversion was added after Stage 6 through the shared query/HTTP layer. Localization beyond the existing English presentation is not added
by this stage. Those are separate product capabilities, not deployment prerequisites.
