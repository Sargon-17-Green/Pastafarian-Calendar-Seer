# Container deployment

The repository provides a multi-stage Docker build for the public HTTP v1 service.

The image is deliberately built with the exact **portable** RNS backend on both supported Linux container architectures. BuildKit supplies `TARGETARCH`, which is mapped to the explicit native build policy:

```text
linux/amd64 -> SEER_ARCH=amd64 -> -march=x86-64
linux/arm64 -> SEER_ARCH=arm64 -> -march=armv8-a
SEER_RNS_BACKEND=portable
```

This avoids baking the build host's CPU-specific `-march=native` instructions into a distributable image. Ordinary local Linux builds still default to `SEER_ARCH=auto` and `SEER_MARCH=native`.

## Build

From the repository root:

```text
docker build -t pastafarian-calendar-seer:local .
```

The build packs the npm package first, installs that tarball into a clean build stage, compiles the four exact-runtime binaries, runs the package self-test, and validates the rolling cache. The final runtime stage does not contain the compiler toolchain.

## Run

```text
docker run --rm -p 8080:8080 pastafarian-calendar-seer:local
```

The image sets:

- `HOST=0.0.0.0`
- `PORT=8080`
- `SEER_REQUIRE_ENGINE_SERVICE=1`
- `SEER_WEB_ROOT=/opt/seer-web`

The service therefore requires the persistent exact engine rather than silently operating as a cache-only deployment. It also serves the production static web application at `/web/` and redirects `/` there. `/v1/*`, `/openapi.*`, and `/schemas/*` keep their API behavior; there is no SPA fallback that can absorb those routes.

The web application is copied into the image separately from the npm package. The npm tarball boundary remains unchanged.

## Health

The image healthcheck calls provider-private `GET /_health/live` on the loopback interface. It has a 3-second Docker deadline and a 1.5-second request deadline, and it never checks the rolling cache or executes an exact calendar conversion. Orchestration may use `GET /_health/ready` for bounded engine readiness. Public clients use `/v1/status`, which exposes only `ok`, `degraded`, or `unavailable`. The release image is intentionally exact-only unless cache data is mounted: an absent unconfigured cache is therefore healthy, while stale/corrupt cache data or an explicitly configured missing cache is `degraded` when the required exact engine remains usable.

The repository workflow `Verify container deployment` runs this smoke natively on both `linux/amd64` and `linux/arm64`. It performs an exact HTTP request whose calculation JDN is after the Seer Foundation while its target JDN is before it, then verifies reverse conversion and the corresponding year structure. It also performs a request that crosses the historical +40,000-gate boundary, proving that the packaged image contains and uses the extended corpus rather than merely the rolling cache or the old gate horizon.

The canonical Seer Foundation JDN used by that smoke test remains `-13334246`; this is the JDN axis and is distinct from the calendar's other linear day axis.

## Architecture

The verified container architectures are **linux/amd64** and **linux/arm64**. ARM64 uses the portable scalar RNS backend; the AVX2 backend remains x86-only. CI builds and runs each architecture on a native GitHub-hosted runner, and separately builds an OCI multi-architecture layout containing both platforms. QEMU is used only for the supplementary combined Buildx layout, not as the evidence for ARM64 runtime correctness.

The ARM64 path is checked against the same canonical architecture fixture as amd64, including positive and historical negative-gate cases, reverse conversion, range queries, year structure, typed domain errors, and persistent-service reuse. Performance numbers are informational only; ARM64 support is a correctness guarantee, not a claim that the portable backend matches AVX2 throughput.
