# Supply-chain verification

This document describes how release origin and artifact integrity are established. It does **not** prove that the Pastafarian Calendar implementation is mathematically or semantically correct; calendar correctness is verified by the project's semantic test suites.

## Current release status

`v0.1.2` was the one-time npm bootstrap release. Its GitHub tarball and npm tarball are the same verified bytes, but the npm copy predates OIDC provenance.

`v0.1.3` was the first release verified here with npm OIDC provenance. Its GitHub and npm tarballs are byte-identical with SHA-256 `6936a6da8f67d36cbb759c4861d32e61b921471b2c8ad940b79eaee8864e853b`.

`v0.1.4` added the verified ARM64/runtime and localization workstreams. Its GitHub Release is immutable at commit `e851014f84ff176ee3b44c7d3b8eadbb4c904ec0`; npm `0.1.4` has SLSA v1 provenance.

`v0.1.5` is intentionally recorded as a **partial release**. Its tag is fixed at commit `91e6fdddccc2e86fdaea53dd22e3de8ace252132`. npm `0.1.5` was published with SLSA v1 provenance and the GHCR multi-architecture image was published and verified, but the final GitHub Release workflow stopped before creating release assets because the generated npm CycloneDX document did not carry an explicit release-version root component and the validator rejected it. The published npm and GHCR artifacts are not rewritten or removed.

`v0.2.0` is also a **partial release** originating from commit `60574f568f365e4bdf06963a5582a840a5646e76`. npm `0.2.0` remains published with SLSA v1 provenance, which records `refs/tags/v0.2.0` and that exact commit. The container workflow built and pushed a multi-architecture image with top-level digest `sha256:5e83f59c5bd87195354608fe87e30ef3fc61d5cf441556b7dd491f76ac9b4444`, but was cancelled while creating the GitHub image attestation, before Trivy gates, pull-by-digest smoke, digest-record upload, or final GitHub Release publication. The remote `v0.2.0` Git tag and GHCR version tag are no longer present, so the npm SLSA attestation is the surviving machine-verifiable source record. They are not recreated or moved.

`v0.2.1` is intentionally recorded as another **partial release**. Its tag is fixed at commit `a8a90d4479432a1c73ef74ee4be55d367089a02c`. npm `0.2.1` and the GHCR multi-architecture image were published with verifiable provenance, and matching GitHub release assets were generated, but the GitHub Release remained a draft and was never published. Final adversarial QA subsequently found runtime/schema drift: duplicate `include` values were silently deduplicated even though the public schema requires uniqueness. The QA fix also landed after the `v0.2.1` tag, so the old tag, npm artifact, GHCR image, and draft release must not be moved, overwritten, or promoted as the final release.

`v0.2.2` supersedes the partial `v0.2.1` line with the QA regression fix and the post-QA release alignment.

`v0.2.3` is intentionally recorded as a **partial release** at commit `598ea3bba5583ebe0844b7eee0fe9402b3928c22`. Its unified release-candidate verification passed. The three native npm runtime packages `0.2.3` and the GHCR multi-architecture image were published from that tag, but the native publication workflow initially failed because npm had accepted each publish while the registry still returned a temporary 404 during processing. A later retry exposed an upstream MSYS2 packaging change: MinGW GCC 16.2.0-4 split OpenMP into the optional `mingw-w64-ucrt-x86_64-libgomp` package, so the Windows rebuild could not link `-lgomp`. The root npm package and final GitHub Release were therefore not published. The tag and already-published artifacts are not moved, overwritten, or backfilled under changed workflow code; the recovery is issued as a new patch version.

The repository is configured so that GitHub Releases are immutable once published. A published release's tag and assets must not be moved or replaced. If a published artifact is defective, publish a new patch version.

## Release identity

A hardened release uses one version and one commit across:

- Git tag `vX.Y.Z`;
- `package.json` version `X.Y.Z`;
- GitHub Release `vX.Y.Z`;
- npm package `pastafarian-calendar-seer@X.Y.Z`;
- exact-version npm runtime packages `pastafarian-calendar-seer-linux-x64@X.Y.Z`,
  `pastafarian-calendar-seer-linux-arm64@X.Y.Z`, and
  `pastafarian-calendar-seer-win32-x64@X.Y.Z`;
- GHCR tags `X.Y.Z` and `vX.Y.Z`;
- `release-manifest.json`.

The immutable GHCR manifest digest, not a mutable tag, is the container source of truth.

## Publication order

1. The tagged commit must be reachable from `main` and its tag must exactly match `package.json`.
2. The exact tag commit must have a successful unified release-candidate manifest whose gate set and authority digest match `.github/release-gates.json` at that commit.
3. `release-native-npm.yml` builds the portable exact runtime natively on Linux x64,
   Linux arm64, and Windows x64, runs a registry-style long-lived clean-install
   proof, and publishes the three exact-version platform packages through OIDC
   Trusted Publishing with provenance.
4. `release-npm.yml` waits for that workflow and refuses to publish the root
   package until all three platform versions exist. It then publishes the
   byte-reproducible root tarball through OIDC and proves a clean
   `--ignore-scripts` registry install can execute an exact cache miss without
   `build:native`.
5. GHCR publishes the final image, BuildKit provenance/SBOM attestations, and a GitHub artifact attestation for the image digest.
6. The GitHub Release workflow independently rebuilds the npm tarball and requires it to be byte-identical to the registry tarball.
7. It generates npm CycloneDX and container SPDX SBOMs, a release manifest, checksums, and GitHub attestations.
8. Assets are accumulated in a draft release without replacing an existing asset. Only after verification succeeds is the draft published and made immutable.

Publication workflows use per-version concurrency groups and never overwrite an existing npm version or GHCR version tag. A retry may reuse an existing version only after proving that the published bytes/digest and source identity match the tagged commit.

## GitHub Actions integrity

Every third-party `uses:` reference in `.github/workflows` and `.github/actions` is pinned to a full 40-character commit SHA. A same-line version comment records the human-readable release. `ci/verify-workflow-policy.mjs` also rejects action-version drift, so one Marketplace Action cannot silently use multiple SHAs in different workflows or composite actions. Runtime tools hidden behind actions are constrained where material to reproducibility: Syft is pinned to `v1.52.0`, Buildx to `v0.37.1`, Trivy to `v0.70.0`, and the QEMU `tonistiigi/binfmt:latest` image is pinned to OCI index digest `sha256:400a4873b838d1b89194d982c45e5fb3cda4593fbfd7e08a02e76b03b21166f0`. Dependabot is configured to propose updates for GitHub Actions, Docker, and npm metadata; updates are not auto-merged.

`npm run` does not download workflow actions. `scripts/audit-supply-chain.mjs` checks workflow references, explicit permissions, Docker/runtime-tool pins, and repository leakage guards. `ci/verify-workflow-policy.mjs` extends that boundary to composite actions, enforces the production/release/manual-benchmark separation, and requires the contract-tool lock to use exact versions. `verify-supply-chain.yml` runs both audits and parses both workflow and composite-action YAML.

## Docker base and image integrity

The human-readable base is `node:24-bookworm-slim`, pinned in `Dockerfile` to its OCI index digest. Pinning the index rather than an architecture-specific child manifest allows the same immutable base identity to resolve correctly for the verified `linux/amd64` and `linux/arm64` builds.

The release workflow records the GHCR top-level multi-architecture image digest plus the `linux/amd64` and `linux/arm64` child digests. Consumers should normally pull the top-level digest and let the container runtime select the matching child:

```bash
docker pull ghcr.io/sargon-17-green/pastafarian-calendar-seer@sha256:<manifest-digest>
```

Both published child images are pulled by immutable child digest and checked for non-root execution, `/v1/status`, web/client serving, and an exact calendar query; the arm64 smoke runs through QEMU in the release job after native ARM64 CI has already passed. Trivy retains separate HIGH/CRITICAL reports for amd64 and arm64 and fails publication if either child has an unfixed-aware CRITICAL finding. A vulnerability finding is a dependency/security signal, not evidence about calendar semantics.

## SBOMs

A hardened GitHub Release contains:

- `pastafarian-calendar-seer-X.Y.Z.cdx.json` — CycloneDX SBOM for the npm package contents. Syft is version-pinned, and the SBOM root component identity is explicitly set and verified as `pastafarian-calendar-seer@X.Y.Z`;
- `pastafarian-calendar-seer-X.Y.Z-container-amd64.spdx.json` — SPDX JSON SBOM for the immutable `linux/amd64` child image;
- `pastafarian-calendar-seer-X.Y.Z-container-arm64.spdx.json` — SPDX JSON SBOM for the immutable `linux/arm64` child image.

BuildKit also publishes container provenance and SBOM attestations with the OCI image.

## Provenance and attestations

npm Trusted Publishing uses GitHub Actions OIDC rather than a long-lived npm token. npm provenance ties the published package to its build environment and source repository.

GitHub Artifact Attestations bind release artifacts and the container digest to the repository, workflow, ref, and commit. Verify them with GitHub CLI, for example:

```bash
gh attestation verify pastafarian-calendar-seer-X.Y.Z.tgz --repo Sargon-17-Green/Pastafarian-Calendar-Seer
gh attestation verify oci://ghcr.io/sargon-17-green/pastafarian-calendar-seer@sha256:<digest> --repo Sargon-17-Green/Pastafarian-Calendar-Seer
```

Attestation proves origin/integrity claims about a build. It does not prove that the source code, algorithm, test oracle, or calendar semantics are correct.

## npm verification

After publication, inspect npm's SRI metadata:

```bash
npm view pastafarian-calendar-seer@X.Y.Z dist.integrity dist.tarball
npm audit signatures --include-attestations
```

`dist.integrity` is an npm SHA-512 SRI value. It is intentionally different in format and algorithm from the GitHub Release SHA-256 checksum. The release pipeline downloads the npm tarball and verifies both its SRI and byte identity with the independently packed GitHub tarball.

The one-time root-package npm bootstrap is complete: the package was created from the verified `v0.1.2` GitHub tarball, then the GitHub Actions Trusted Publisher for `release-npm.yml` was configured. The temporary interactive npm credential was revoked, and the repository contains no long-lived npm publication secret.

The three platform-runtime package names require their own one-time bootstrap because
npm does not permit configuring a Trusted Publisher for a package that does not yet
exist. Bootstrap only an inert prerelease such as `0.0.0-bootstrap.0`, configure
`release-native-npm.yml` as the Trusted Publisher for each name, and do not point a
supported root-package version at the bootstrap release. Real runtime versions are
then published only by OIDC and are required to match the root version exactly.

## Release-candidate gate authority

`.github/release-gates.json` is the sole source of truth for pre-tag verification gates. `.github/workflows/verify-release-candidate.yml` binds those gates to one exact commit and emits a machine-readable `release-candidate-verification.json`. Tag publication fails closed unless that manifest names the exact tag SHA, carries the current authority digest, contains the complete required gate set, and records every gate as successful.

This release-candidate verification manifest is distinct from the final `release-manifest.json`: the former proves the required source/test gates before publication; the latter records the identities and digests of the artifacts actually published afterward. See `docs/RELEASE_CANDIDATE_VERIFICATION.md`.

## Release manifest and one-command verification

`release-manifest.json` is the machine-readable index connecting the version, commit, tag, GitHub tarball SHA-256, npm integrity/tarball URL, GHCR top-level digest, both platform child digests, and the per-platform SBOM filenames.

From a source checkout or installed package:

```bash
npm run verify:release -- X.Y.Z
```

For legacy or partially published versions only, repository maintainers can use:

```bash
node scripts/verify-release.mjs X.Y.Z --allow-incomplete
```

Strict verification requires GitHub Release, npm, GHCR, and the release manifest all to agree.

## Secrets and automation

The rolling Venus-cache workflow uses only the repository-scoped `GITHUB_TOKEN` with `contents: write` to advance the dedicated `cache-data` branch. It never edits a workflow, pushes `main`, or requires a long-lived cache secret. Rolling cache bytes are excluded from npm, release assets, and release images; see `docs/ROLLING_CACHE.md`.

Release publication uses `GITHUB_TOKEN` and OIDC where GitHub-native authorization is sufficient. No npm PAT is required by the hardened release workflow.

## Failure recovery

Never move a release tag, unpublish/re-publish an npm version, overwrite a GHCR version tag, or silently replace a published GitHub Release asset.

If npm or GHCR fails before publication completes, rerun only the failed channel workflow, then rerun the final GitHub Release workflow. If the final workflow fails **after npm and/or GHCR have already published an immutable version but before a GitHub Release exists**, do not move the tag or attempt to backfill a changed workflow under that tag; record the version as partial and publish the fix under a new patch version. If the final workflow has an existing draft, it resumes only when every existing draft asset is byte-identical; it never overwrites a differing asset. If a published release is bad, create a new patch version.

## `HANDOFF_*` exclusion

`HANDOFF_*` material is user-only. It is excluded from the Docker build context and must not be tracked, packed, included in an SBOM, uploaded as a workflow artifact, attached to a release, published to npm, or included in a container.
