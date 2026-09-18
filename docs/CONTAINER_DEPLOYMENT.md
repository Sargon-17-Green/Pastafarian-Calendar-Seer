# Container deployment

The repository provides a multi-stage Docker build for the public HTTP v1 service.

The image is deliberately built with the exact **portable** RNS backend and a generic x86-64 code-generation target:

```text
SEER_RNS_BACKEND=portable
SEER_MARCH=x86-64
```

This avoids baking the GitHub runner or build host's CPU-specific `-march=native` instructions into a distributable image. Ordinary local native builds still default to `SEER_MARCH=native`.

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

The image healthcheck calls `GET /v1/status` on the loopback interface.

The repository workflow `Verify container deployment` additionally performs an exact HTTP request whose calculation JDN is after the Seer Foundation while its target JDN is before it. This forces the packaged persistent service through the historical negative-gate domain and verifies that the container is not merely serving the rolling cache.

The canonical Seer Foundation JDN used by that smoke test remains `-13334246`; this is the JDN axis and is distinct from the calendar's other linear day axis.

## Architecture

The current container is an **x86-64 Linux** deployment artifact. The portable RNS backend means “no AVX2 requirement”; it does not imply a multi-architecture native build. ARM64 support would require separately validating all native C++ build assumptions and exact-runtime behavior.
