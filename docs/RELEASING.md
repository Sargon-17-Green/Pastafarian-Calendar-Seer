# Releasing Pastafarian Calendar Seer

A hardened release aligns three distribution channels to one version and one commit:

1. **npm registry** — publishes the deterministic npm tarball through Trusted Publishing / GitHub Actions OIDC.
2. **GHCR** — publishes the final runtime image and records its immutable OCI digest.
3. **GitHub Release** — is published last, after both channels are verified, and becomes immutable.

The package version in `package.json` is the release version. The release tag must be exactly `v<version>`.

## Pre-tag verification

`.github/release-gates.json` is the single machine-readable authority for release-candidate source verification. Do not maintain a separate gate list in a release workflow or QA checklist.

Before creating a version tag, dispatch `.github/workflows/verify-release-candidate.yml` on the exact commit intended for the tag. It reuses successful or already-running exact-head gate runs and invokes only missing gates through reusable workflows. A successful full run emits `release-candidate-verification.json`, bound to the candidate SHA and to the SHA-256 of the authority file.

All tag publication workflows call `scripts/verify-release-candidate-manifest.mjs` before publishing. A manifest for an ancestor, another SHA, a different authority revision, or an incomplete gate set is rejected. The root npm workflow still waits for native-runtime publication, and the final GitHub Release still waits for npm and GHCR publication; those are post-tag publication dependencies rather than source-verification gates.

`Release verification policy` is the lightweight required branch check. It validates that the authority, reusable workflows, orchestrator, release workflows, and release documentation remain wired together. The full expensive matrix is intentionally an exact-SHA release-candidate operation rather than a PR-required matrix, because a PR head is not necessarily the eventual merge/tag SHA.

See `docs/RELEASE_CANDIDATE_VERIFICATION.md` for the orchestration and manifest contract.

## npm Trusted Publishing

`.github/workflows/release-npm.yml` runs only for `v*` tag pushes in the canonical repository. It grants `contents: read`, `actions: read`, and `id-token: write`; it does not use `NPM_TOKEN`.

The workflow builds the package twice from clean worktrees and requires byte-identical SHA-256 results before publication. It then publishes through npm OIDC with provenance, or enters verification-only resume mode if that exact version already exists.
An existing npm version is accepted on retry only if its registry tarball is byte-identical to the deterministic tagged package and its npm SRI verifies. The workflow also performs a clean registry install, public-import and CLI-shim checks, native build, package self-test, cache validation, and `npm audit signatures --include-attestations`. Missing or invalid provenance fails the workflow.

Trusted Publishing configuration is:

- provider: GitHub Actions;
- GitHub owner/user: `Sargon-17-Green`;
- repository: `Pastafarian-Calendar-Seer`;
- workflow filename: `release-npm.yml`;
- GitHub environment: none.

The one-time npm bootstrap is complete. Version `0.1.2` was created from the already verified GitHub Release tarball with SHA-256 `471251e3f3a884341d8346e502d7bb9e411f9cb5b0c6f31f2a9027aff4e99e4a`. Interactive web authentication and account-level 2FA were used only for that bootstrap; the temporary local credential was revoked. Version `0.1.2` therefore has normal registry signatures but no CI provenance attestation.

## GHCR publication

`.github/workflows/release-container.yml` publishes `ghcr.io/sargon-17-green/pastafarian-calendar-seer` using `GITHUB_TOKEN` as one OCI index containing `linux/amd64` and `linux/arm64`. Version tags are `X.Y.Z` and `vX.Y.Z`; the top-level digest and both child digests are recorded.

A retry never overwrites an existing version tag. If both version tags already exist, the workflow continues only when they resolve to the same top-level digest, that index contains both required platform children, and the release identity matches the exact commit/version. Otherwise it fails closed.

The container publication records BuildKit provenance/SBOM attestations and a GitHub artifact attestation for the index digest. It runs separate Trivy HIGH/CRITICAL scans and CRITICAL gates for amd64 and arm64, then pulls each child by digest and performs non-root, readiness, web/client, and exact-query smoke tests.

## Final immutable GitHub Release

The GitHub Release workflow waits for successful npm and GHCR publication for the same commit. It independently rebuilds the npm tarball and requires byte identity with npm before assembling the final release.
The final release contains the npm-format tarball, its SHA-256 file, `SHA256SUMS`, a CycloneDX package SBOM, separate SPDX SBOMs for the amd64 and arm64 child images, and `release-manifest.json`. Syft is version-pinned and the package SBOM root component must exactly match the release package name and version. GitHub artifact attestations bind the tarball and checksum material to the workflow/commit, and bind each platform SBOM to its immutable child digest.

Release assets are accumulated in a draft. Existing draft assets are never replaced silently: a retry may reuse an asset only if the bytes are identical. Only after all checks pass is the draft published. Repository-level immutable releases then lock the release assets and associated tag.

## Failure recovery

Publication is intentionally restartable without duplicate publication:

- if npm was already published, verify the existing bytes, SRI, and provenance instead of publishing again;
- if GHCR version tags already exist, verify their common digest and source labels instead of overwriting them;
- if a GitHub draft exists, compare and reuse identical assets;
- if a GitHub Release is already published, do not modify its assets or move its tag.

Never unpublish/re-publish a version, force-move a release tag, overwrite a GHCR version tag, or replace an immutable release asset. If npm/GHCR have already published but the final GitHub Release fails before publication, keep that version as a documented partial release and fix the workflow under a new patch version. If a published release is defective, create a new patch version.

## Release safety rules

All workflow actions are SHA-pinned, Docker bases are digest-pinned, and release workflows use per-version concurrency groups. `HANDOFF_*` material is user-only and must never enter git, npm, workflow artifacts, release assets, SBOMs, attestations, Docker build context, or the final image.

Supply-chain provenance establishes origin and integrity. It does not prove the calendar mathematics or semantic correctness; those remain the responsibility of the semantic verification suites.
