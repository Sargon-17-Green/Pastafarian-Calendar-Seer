# Long-lived npm local runtime

## Contract

A normal installation of `pastafarian-calendar-seer@X.Y.Z` on a supported
Node platform installs an exact, prebuilt native runtime of the **same version**
as an npm optional dependency.

Supported prebuilt targets are:

| Node platform | Node arch | Optional package |
| --- | --- | --- |
| `linux` | `x64` | `pastafarian-calendar-seer-linux-x64@X.Y.Z` |
| `linux` | `arm64` | `pastafarian-calendar-seer-linux-arm64@X.Y.Z` |
| `win32` | `x64` | `pastafarian-calendar-seer-win32-x64@X.Y.Z` |

The rolling cache is never required for correctness. It is a verified
performance hint only. A cache miss, stale cache, corrupt cache, absent cache,
or a calculation day months after publication falls through to the exact
runtime and therefore has the same semantics.

The root package has no `postinstall`, `install`, or `preinstall` build
step. Installing the package does not invoke a compiler and does not download
runtime artifacts from an arbitrary URL at query time.

## Resolution order

For each exact executable, the Node runtime uses this order:

1. explicit API binary override;
2. the corresponding `SEER_*_BIN` environment variable;
3. a local source-built executable under `prototype/build/`;
4. the exact-version platform optional package.

This preserves the existing source-build override while making ordinary npm
installs durable.

The optional package version must equal the root package version exactly.
Version drift or an incomplete optional package fails deterministically as
`SEER_UNAVAILABLE`; the runtime never substitutes a semantically different
engine.

## Browser/client-only and unsupported platforms

`pastafarian-calendar-seer/client` remains browser-safe and requires no
compiler or native runtime.

Because native packages are `optionalDependencies` with `os`, `cpu`, and
on Linux `libc` constraints, an unsupported platform can still install the
root package and use the HTTP/browser client. The same is true when a consumer
intentionally installs with:

```bash
npm install --omit=optional pastafarian-calendar-seer
```

In that configuration, a local exact cache miss intentionally returns
`SEER_UNAVAILABLE` with an actionable message. It does not fabricate a result
and does not silently switch algorithms.

## Source-build fallback

Maintainers and unusual supported environments may explicitly build from the
source already carried by the root npm package:

```bash
npm explore pastafarian-calendar-seer -- npm run build:native
```

This remains a fallback, not an install-time lifecycle script. A compiler is
therefore never a prerequisite for browser/client-only consumption.

## Prebuilt backend

Published prebuilt packages force the exact portable RNS backend and a generic
CPU baseline. They do not use `-march=native`.

Local source builds may still select the verified optimized backend where
available. Backend selection is an implementation/performance choice only:
architecture-conformance and differential tests require canonical output parity.

The prebuilt package contains:

- `seer_year_batch`;
- `seer_year_locator`;
- `seer_year_structure`;
- `seer_engine_service`;
- the non-system runtime libraries required by those executables;
- `runtime-manifest.json`;
- applicable third-party license texts;
- the GMP 6.3.0 corresponding-source archive.

The canonical gate data remains in the root package and is shared by all
platform runtimes.

## GMP, OpenMP, and C++ runtime

The current exact engine links to GNU MP (GMP) and uses GNU OpenMP when built
with GCC-compatible toolchains.

Published prebuilt packages statically link the GCC runtime, libstdc++, GNU
OpenMP runtime, and on Windows winpthreads into the Seer executables. Packaging
fails if those components reappear as separate runtime DLLs/shared objects.

GMP remains dynamically linked. Crucially, the release jobs do **not**
redistribute a distro/MSYS2 GMP binary: they verify the pinned upstream GMP
6.3.0 source archive, build GMP from that archive on the target architecture,
run GMP's own test suite, link Seer against that exact build, and package the
resulting GMP shared library together with the same source archive. Linux
executables use `$ORIGIN` so the packaged GMP is resolved locally.

Linux x64/arm64 prebuilt artifacts are built inside the pinned Bookworm
baseline used by the project and therefore have a published minimum of
glibc 2.36. The Node loader checks that baseline before attempting execution.

GMP 6.3.0 is dual licensed under LGPLv3 or GPLv2 at the recipient's choice.
These packages use the LGPLv3 path and include the exact upstream
`gmp-6.3.0.tar.xz` used to build the bundled library, with pinned SHA-256:

```text
a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898
```

GCC runtime components are accompanied by their upstream GPLv3 and GCC Runtime
Library Exception 3.1 texts. The Windows winpthreads license text is included
as well. Third-party terms apply to those components; they do not relicense the
Seer source itself.

## Binary provenance

Every platform package contains `runtime-manifest.json` recording:

- root/native package version;
- target platform/architecture;
- backend (`portable`);
- source Git commit;
- compiler/toolchain identification;
- packaged runtime-library package versions where available;
- SHA-256 of every EXE/shared library in `bin/`;
- GMP source version, archive path, and source SHA-256.

Release builds publish the platform packages from GitHub-hosted runners using
npm Trusted Publishing/OIDC. The root package release waits until all three
exact-version platform packages are present before publishing.

### One-time package-name bootstrap

npm requires a package to exist before a Trusted Publisher can be configured.
Each new platform package name therefore needs one interactive bootstrap
publication. The recommended bootstrap is a non-production prerelease such as
`0.0.0-bootstrap.0`, followed immediately by configuration of
`.github/workflows/release-native-npm.yml` as the Trusted Publisher.

No supported Seer version should use the bootstrap package. Supported versions
are then published only through the OIDC workflow with provenance.

## Long-lived clean-install test

`deployment/test/registry-style-install.mjs` creates a clean HTTP npm-registry
simulation, installs the root package by name/version with `--ignore-scripts`,
and executes `queryNow()` at a calculation instant thirty days after the
reference release date with no rolling cache and no local build.

The same test also proves:

- `--omit=optional` leaves the browser client usable;
- a simulated unsupported OS/architecture install does not fail merely because
  no native runtime matches;
- local exact use without a matching optional package fails explicitly rather
  than changing semantics.

`.github/workflows/verify-prebuilt-native-packages.yml` runs this proof on
Linux x64, Linux arm64, and Windows x64.

## Non-selected alternatives

A larger immutable rolling-cache window is rejected because it merely moves the
failure date.

An external cache/data package remains useful only as a performance channel; it
cannot be semantic authority and cannot guarantee arbitrary future calculation
days.

A WASM or pure-JavaScript exact engine would be a valuable portability project,
but it is not used as a fallback until it has an independent exact
implementation and full differential/conformance evidence. Adding an
unverified second implementation merely to avoid native packaging would create
semantic risk.

Automatic query-time binary download is rejected because it introduces network
state and mutable remote availability into local execution and complicates
supply-chain verification.
