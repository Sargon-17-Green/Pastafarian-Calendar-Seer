# Final Adversarial QA Report — 2026-09-18

## Final verdict

**FINAL VERIFIED** for the release subject commit:

- Repository: `Sargon-17-Green/Pastafarian-Calendar-Seer`
- Release subject commit: `4c8e683af9aeba43daf29e9e752ada4bae14458b`
- Package version: `0.2.2`
- Git tag: `v0.2.2`
- GitHub Release: published, non-draft, non-prerelease
- npm: `pastafarian-calendar-seer@0.2.2`
- GHCR: `ghcr.io/sargon-17-green/pastafarian-calendar-seer:0.2.2` and `:v0.2.2`
- Open BLOCKER findings: **0**
- Open HIGH findings: **0**

This verdict applies to the runtime/package/release subject commit above. This report is added afterward as a documentation-only successor commit and does not alter the released runtime or artifacts.

The Seer remains non-normative. Where semantic authority matters, the canonical specification/Scroll remains authoritative; implementation agreement alone is not treated as proof.

## Scope and method

This was an independent adversarial QA pass after the parallel workstreams for npm publication, production web integration, localization, ARM64/multi-architecture support, gate-domain extension, supply-chain hardening, and Hosted Public API contract work.

The QA deliberately did not accept any of the following as sufficient evidence by itself:

- a green workflow;
- a prior conversation saying VERIFIED;
- an existing release;
- agreement among production implementations;
- README claims;
- an existing unit test.

Existing suites were used as one evidence source, but they were supplemented by independent fixtures, custom differential scripts, clean-package installs, registry downloads, release-asset rehashing, failure injection, and direct API/HTTP/browser checks.

## Identity and authority-sensitive constants

The Seer Foundation JDN used throughout this QA was:

```text
-13334246
```

The unrelated linear-axis value `-15055671` was not used as a Seer JDN fixture.

The final released version is `0.2.2`. The prior `0.2.1` line is intentionally documented as a partial release: its npm and GHCR artifacts were published, but its GitHub Release remained a draft, and final QA later found runtime/schema drift. No old tag or artifact was moved or overwritten.

## Environments

Verification covered:

- Linux x86-64 GitHub-hosted runners;
- Windows x86-64, including MSYS2/UCRT64 + GMP native build;
- Linux ARM64 on native GitHub-hosted ARM runners;
- WSL2 Ubuntu x86-64 for independent semantic/oracle runs;
- Chromium browser E2E;
- Linux amd64 and arm64 containers;
- clean npm consumer projects installed from the public registry;
- direct GHCR OCI Registry API access;
- GitHub CLI attestation verification.

The local Windows environment exposed a wrapper-level peculiarity where `npm explore ... -- npm run build:native` could remain alive after the native build had already printed successful completion. The native binaries were built correctly, and direct self-test/release verification succeeded afterward. This was treated as a local wrapper/environment observation, not as a Seer runtime correctness failure.

## Public-surface inventory verified

### Node API

The package root exposes the expected application API, including:

- `queryDate`
- `queryNow`
- `queryBatch`
- `queryRange`
- `queryReverse`
- `queryCalculationDay`
- `queryYear`
- `SeerQueryError`
- `gregorianToJdn`
- `jdnToGregorian`

The `/query`, `/client`, and `/http` package subpaths were also verified from a clean registry install.

### Browser client

The production client surface was verified through the browser and package tests, including date, now, batch, range, reverse, calculation-day, year, locales, meta, status, and OpenAPI retrieval.

### HTTP

The OpenAPI contract and runtime expose the v1 date, now, batch, range, reverse, year, calculation-day, locales, meta, status, OpenAPI JSON/YAML, and referenced schema resources. `/schemas/{schema}` was independently checked for valid 200 responses and typed 400/404 behavior.

### CLI

The date/now/calculation-day/range/reverse/year/batch command surface was retained. Final QA additionally fixed `--help` / `-h` so help now exits zero and writes usage normally instead of being treated as an unknown argument.

### Distribution

Verified channels for `0.2.2`:

- source checkout;
- npm;
- GitHub Release;
- GHCR;
- amd64/arm64 container builds;
- static/production web application.

The Hosted Public API architecture document added during the QA window is explicitly a pre-launch production contract and is not treated as evidence that a public hosted endpoint is already live.

## Independent semantic differential QA

### Foundation vicinity

A custom WSL/Linux build compared production output with the independent canonical vector oracle for ten Foundation-adjacent fixtures:

- Foundation as calculation day with target at F-2, F-1, F, F+1, F+2;
- Foundation as target day with calculation at F-2, F-1, F, F+1, F+2.

All canonical fields matched.

### Gate-domain boundaries and compatibility mode

The QA derived the relevant corpus gate positions and checked production against the oracle around:

- positive gate 40000;
- positive gate 40001;
- negative gate 40000;
- negative gate 40001;
- days immediately before/on/after the boundaries;
- calculation days immediately inside and outside the legacy-compatibility interval.

A total of 25 Foundation/gate-boundary differential fixtures passed.

An apparent initial mismatch at positive gate 40000 was traced to invoking the independent oracle in the wrong mode. The final discriminator explicitly compared legacy-radius and extended oracle modes and proved that production matched the required legacy-40k compatibility result inside the legacy calculation-day interval while using the extended result outside it.

### Year / cutlet / month edges

For calculation JDN `2461302`, Year 5000 was independently audited:

- length: 4862 days;
- start JDN: `2458436`;
- end JDN: `2463297`;
- cutlets: 7;
- months: 43.

Checks included:

- cutlet lengths sum to year length;
- month lengths sum to year length;
- first offset is zero;
- final cutlet end offset is the final year offset;
- cutlet ranges are contiguous;
- returned day sequence is contiguous in JDN;
- every day lies inside the declared year;
- first/second/last day remain in Year 5000;
- day after the end becomes Year 5001.

The audit executed 4,861 forward/reverse checks across year boundaries and month/cutlet transition coverage. In addition, 24 representative year/cutlet/month edge samples were compared independently against `canonical_vector_oracle`; all matched.

### Difficult weave and full-domain gates

Exact-head workflows were manually dispatched on the final release subject commit to avoid relying on path filters. The following passed on that exact SHA:

- full finite gate-domain Phase C;
- difficult weave edge ranks;
- negative-gate corpus Phase A;
- bidirectional gate-domain Phase B;
- 100k gate-domain extension;
- bidirectional benchmark backends.

## Round-trip QA

The following round-trip families passed:

- proleptic Gregorian -> JDN -> Gregorian, including CE, leap rules, century exception, BCE, large years, Foundation vicinity;
- forward Pastafarian conversion -> reverse -> same target;
- reverse valid canonical tuple -> target -> forward -> same canonical tuple;
- Year 5000 day tuples -> reverse -> original target JDN.

Contradictory reverse coordinates were covered by the reverse contract tests and exact-head reverse workflow and return typed conflict/invalid-date errors rather than silently selecting one coordinate system.

## Calculation day / observer QA

Independent tests verified:

- explicit calculation JDN requires no observer resolution;
- explicit RFC3339 instant resolves through the boundary service;
- default Kisurra observer;
- explicit longitude;
- longitude normalization, including 180 -> -180 and -0 -> 0;
- invalid longitude;
- conflicting observer selectors;
- `latitude` and `elevationMeters` as compatibility no-ops;
- one captured request instant for batch items;
- boundary response shape and interval behavior.

## Request validation and error contract

Adversarial validation covered, among other cases:

- ambiguous target;
- missing/invalid selectors;
- conflicting calculation selector;
- non-canonical integer forms such as `+1`, `01`, `-0`, `1.0`, `1e3`;
- unsafe JSON numeric integers;
- impossible Gregorian dates;
- malformed RFC3339 values;
- unsupported/duplicate includes;
- unsupported presentation;
- malformed and unsupported locales;
- null/array/wrong-shape inputs;
- duplicate HTTP query parameters;
- very large exact-integer strings;
- over-limit batch/range requests.

Transport-level checks included:

- 400 for shape/mode errors where applicable;
- 406 for unacceptable representation/locale;
- 413 for both declared and chunked over-limit request bodies;
- 415 for unsupported request media type;
- 422 for semantic/domain errors;
- 503 for unavailable exact provider paths;
- no observed unexpected 500s in the adversarial corpus.

The exact-domain error workflow and Stage 5/Stage 6 workflows passed on the release subject commit.

## Batch and range QA

Independent checks covered:

### Batch

- multiple success;
- mixed per-item success/error;
- IDs;
- duplicate IDs;
- defaults and overrides;
- one captured request instant;
- item limit and over-limit rejection.

A failing item remains a typed per-item error rather than turning the entire batch into a 500.

### Range

Covered:

- count mode;
- inclusive-end mode;
- ambiguous/missing end selector errors;
- positive/negative steps;
- zero-step rejection;
- unreachable end rejection;
- fixed calculation mode;
- same-as-target mode;
- cross-boundary behavior.

Each independent sample was checked against expected target sequences.

## Cache vs exact path

The same canonical request was executed through:

1. the rolling cache path;
2. an independently created exact provider with `SEER_REQUIRE_ENGINE_SERVICE=1`.

Canonical calculation day, target day, Pastafarian tuple, and structure matched exactly. Reverse through the exact provider returned the original target.

Windows exact-path timings in this QA were slow for some deep cases (roughly 117 seconds near Foundation and about 157 seconds for one cache-vs-exact exact query). This is a performance limitation, not a semantic mismatch.

## Persistent service and failure injection

Persistent-engine verification passed on the exact release subject commit.

Independent safe failure injection covered:

- required service missing while a one-shot fallback binary was available;
- missing gate-data directory;
- malformed child response;
- child process exit.

All produced typed `SEER_UNAVAILABLE` behavior without silent canonical garbage or forbidden fallback when persistent service was required.

The exact-head OPT-06 persistent-engine workflow also passed.

## Cross-platform and architecture QA

### Windows x86-64

Verified:

- source native build;
- installed-package native build;
- package self-test;
- installed command shim;
- Stage 6 persistent-service smoke;
- portable production fallback parity.

### Linux x86-64

Verified by the main CI matrix and independent WSL semantic/oracle runs.

### Linux ARM64

Native ARM64 verification used a real ARM64 runner rather than only emulation. Exact runtime build, clean package install, canonical fixture generation, and amd64-vs-arm64 canonical comparison all passed.

### Architecture equivalence

The exact-head ARM64 workflow compared canonical outputs between native amd64 and native arm64 and passed.

## Container QA

On the release subject commit:

- native amd64 container PASS;
- native arm64 container PASS;
- multi-architecture OCI index PASS;
- non-root/image contract checks PASS;
- HTTP/web/exact smoke PASS;
- published child images pulled by immutable digest and exact-smoked PASS;
- amd64 and arm64 Trivy CRITICAL gates PASS.

Published GHCR identity:

- top-level digest: `sha256:e66a73cc120bd2ba6dc2d394174f15ed1e3024d33d43c53a4071b21289610b67`
- linux/amd64: `sha256:c642b38287914bbf8d4f2aeb8d35b4ffd3ed9148a59eac3b0634ac451b8a2ae5`
- linux/arm64: `sha256:463b690ab799228eb1ebbb6e34763d15926a084eac96a24b6fe452f05801344f`

Both `0.2.2` and `v0.2.2` tags resolve to the same top-level digest.

The top-level OCI attestation was independently verified and binds the image to `refs/tags/v0.2.2` and commit `4c8e683af9aeba43daf29e9e752ada4bae14458b`.

## npm QA

A clean external Windows project installed:

```text
pastafarian-calendar-seer@0.2.2
```

from the public npm registry, not from the repository checkout.

Verified:

- package root exports;
- `/query`;
- `/client`;
- `/http`;
- schema files;
- CLI shim;
- rolling-cache query;
- exact native Windows build from `node_modules`;
- package self-test;
- strict release verifier;
- npm registry signature;
- npm provenance attestation.

npm release metadata:

- version: `0.2.2`
- SRI: `sha512-Gn0L+ATnuqTLC+atajoO+DSPvCu1DQ0czb3q4pmrkOBKP0lF4yTyPOZB36HSVr+yqc3AladKXXNT4ql17w1gmQ==`

The npm and GitHub Release tarballs are byte-identical:

```text
SHA-256 44af49478aa68fad859a27812a3ec6ac948086ed82897b6c47be89ef3de679b7
size    555187 bytes
```

### Reproducibility/toolchain note

The release pipeline pins `npm@11.19.0`. Its two independent clean worktrees produced the same tarball SHA-256 shown above, and the registry tarball passed byte-for-byte `cmp` against that deterministic artifact.

A separate local test using an older npm 9.2.0 produced a differently compressed `.tgz`, while the uncompressed tar stream and extracted package contents were identical. Therefore the byte-reproducibility claim is interpreted under the pinned release toolchain, not across arbitrary npm major versions.

## GitHub Release QA

`v0.2.2` is published, non-draft, and non-prerelease.

Downloaded assets were independently rehashed and checked against `SHA256SUMS`. Assets include:

- npm-format tarball;
- tarball SHA-256 file;
- CycloneDX npm SBOM;
- amd64 SPDX container SBOM;
- arm64 SPDX container SBOM;
- release manifest;
- SHA256SUMS.

SBOM checks:

- CycloneDX 1.7 root component: `pastafarian-calendar-seer@0.2.2`;
- amd64 SPDX: SPDX-2.3, 240 packages;
- arm64 SPDX: SPDX-2.3, 240 packages.

Tarball and checksum-set GitHub attestations were independently verified.

The final release workflow's first attempt failed transiently in `docker buildx imagetools inspect` while resolving newly published GHCR identities. No release asset had been published at that point. After the GHCR manifest was externally confirmed available, the failed job was rerun using the workflow's designed resume path; attempt 2 passed the previously failing identity step, generated and verified SBOMs/attestations, published the immutable GitHub Release, and completed strict post-release verification. No tag or immutable artifact was moved or replaced.

## Supply-chain QA

Verified:

- all inspected external `uses:` references are pinned to full commit SHAs;
- explicit workflow permissions and no broad `write-all`;
- package boundary excludes repository-only material;
- no `HANDOFF_*` material in package/release/container paths;
- npm OIDC provenance;
- GHCR SLSA/GitHub attestation;
- release-asset attestations;
- parseable CycloneDX/SPDX SBOMs;
- release manifest alignment across Git tag, package version, npm, GitHub Release, GHCR;
- strict `verify-release.mjs 0.2.2` PASS.

## Localization QA

Presentation localization was checked for semantic invariance:

- canonical fields remain unchanged between English and Hebrew presentation;
- locale catalog contains complete 17-cutlet and 47-month data in canonical order;
- Hebrew is marked RTL;
- localized presentation does not alter reverse canonical tuples;
- malformed and unsupported locales produce typed errors.

The Hebrew locale intentionally retains verified English proper names for cutlets/months according to the locale pack's documented proper-name policy.

## Website QA

The production web application delegates calendar semantics to the browser client/HTTP API. Code audit found request construction, UI state, validation, formatting, and transport behavior, but no duplicate calendar conversion/reverse/gate/Venus implementation.

Chromium E2E verified:

- initial load and readiness;
- today/date/JDN flow;
- explicit calculation day;
- reverse;
- year;
- range;
- raw/exchange diagnostics;
- typed API error rendering;
- injected `SEER_UNAVAILABLE`;
- mobile layout;
- RTL;
- cross-origin configuration;
- keyboard activation;
- no uncaught `pageerror`;
- no unexpected console errors.

The strengthened console assertion initially failed because Chromium reports intentionally injected HTTP 422 and 503 responses as console resource errors. The test was corrected to require zero errors before fault injection and thereafter permit only those expected injected status errors while rejecting all other console errors.

## OpenAPI / schema drift QA

Final OpenAPI state:

- JSON and YAML are structurally identical;
- OpenAPI contract version: `1.0.0`;
- 23 referenced local schema files resolved successfully;
- runtime `/schemas/{schema}` behavior matches the documented route;
- 200/400/404 schema-resource behavior checked;
- README central Node and HTTP examples executed successfully.

The Hosted Public API contract change that landed during QA was reconciled before the release patch branch was prepared.

## Packaging boundary, hygiene, and reproducibility

Fresh-clone checks included:

- `HEAD == origin/main` at the audited release subject;
- clean working tree;
- `git diff --check`;
- `git fsck`;
- package self-test;
- package boundary review;
- no `HANDOFF_*`;
- no repository `.github` material in npm package;
- no temporary logs/repair artifacts in package;
- lexical credential-shape scan with no secret values exposed.

The final npm artifact contains 88 files.

## Findings and fixes

### MEDIUM — runtime/schema drift for duplicate include values — FIXED

**Finding:** JSON Schema required unique include values, but runtime normalization silently deduplicated duplicates.

**Reproduction:** duplicate `structure` include returned success before the fix.

**Fix:** runtime now rejects duplicate include values with typed `UNSUPPORTED_INCLUDE`.

**Regression test:** added and observed failing before the fix, then passing after it.

**Merged via:** PR #10.

### LOW — CLI help treated as unknown argument — FIXED

`--help` previously printed usage but followed the unknown-argument error path.

The CLI now handles `--help` and `-h` normally, exits zero, writes help to stdout, and has a regression test.

**Merged via:** PR #11.

### QA blind spot — browser console/page errors — FIXED

The production web E2E did not explicitly fail on page/console errors. Assertions were added and then refined so expected 422/503 fault-injection resource messages do not mask unrelated console errors.

**Merged via:** PR #11.

### DOCS / release alignment — FIXED

`0.2.1` was a partial release and did not represent the post-QA `main`. Supply-chain documentation now records it as partial and `0.2.2` supersedes it.

### Operational transient — GitHub Release attempt 1 — CLOSED

The first final-release job failed with exit 255 while resolving freshly published container identities. npm was already immutable and GHCR publication subsequently completed. External GHCR verification succeeded; rerun attempt 2 passed the same identity step and completed publication without replacing immutable artifacts.

No runtime or semantic fix was required.

## Known limitations

- Some deep exact queries are slow on Windows. This QA observed roughly 117 seconds for one Foundation-area exact query and about 157 seconds for one cache-vs-exact exact request.
- Byte-level npm tarball reproducibility is tied to the pinned release npm toolchain. Older npm versions can emit a different gzip representation even when the underlying tar stream/package contents are identical.
- The Hosted Public API production contract exists, but no public hosted production endpoint is claimed by this report.

These are not open BLOCKER/HIGH correctness findings.

## Key workflow evidence on release subject commit

Automatic exact-head runs:

| Capability | Run |
| --- | ---: |
| Release preflight | 35390117229 |
| Supply-chain hardening | 35390117258 |
| Stage 6 deployment package | 35390117357 |
| ARM64 exact runtime | 35390117319 |
| Container deployment | 35390117309 |
| Production web application | 35390117282 |
| Reverse conversion | 35390117310 |
| Gate-domain extension 100k | 35390117291 |
| Bidirectional gate Phase B | 35390117217 |
| OPT-04 shared month table | 35390117117 |
| OPT-05 year-edge path | 35390117374 |

Manually dispatched exact-head closure runs:

| Capability | Run |
| --- | ---: |
| Full finite gate domain Phase C | 35390153381 |
| Difficult weave edge ranks | 35390155830 |
| Persistent engine service | 35390158150 |
| Portable production fallback | 35390160359 |
| Exact domain error contract | 35390163060 |
| Stage 5 exact provider | 35390165262 |
| Browser integration example | 35390167448 |
| OPT-03 year structure | 35390169999 |
| OPT-01 request cache | 35390172652 |
| OPT-02 bulk exact engine | 35390174902 |
| Negative-gate Phase A | 35390177455 |
| Bidirectional benchmark backends | 35390180230 |

Release runs:

| Channel | Run | Result |
| --- | ---: | --- |
| npm Trusted Publishing | 35390936260 | success |
| GHCR multi-arch publication | 35390936280 | success |
| GitHub Release | 35390936139 | attempt 2 success |

## Final release alignment

The strict verifier reports:

- tag: `v0.2.2`;
- release commit: `4c8e683af9aeba43daf29e9e752ada4bae14458b`;
- GitHub Release immutable;
- GitHub tarball SHA-256: `44af49478aa68fad859a27812a3ec6ac948086ed82897b6c47be89ef3de679b7`;
- npm tarball same SHA-256;
- npm provenance ref: `refs/tags/v0.2.2`;
- npm provenance commit: release subject commit;
- GHCR top digest and amd64/arm64 child digests match `release-manifest.json`;
- release manifest present.

## Conclusion

For release subject commit `4c8e683af9aeba43daf29e9e752ada4bae14458b`, version `0.2.2` satisfies the final adversarial QA criteria exercised in this workstream.

There are no open BLOCKER or HIGH findings.

**FINAL VERIFIED**
