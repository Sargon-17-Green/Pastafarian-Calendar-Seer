# Releasing Pastafarian Calendar Seer

The repository has two distinct but aligned distribution layers:

1. **GitHub Release** — produces the verified npm-format tarball and its SHA-256 checksum.
2. **npm registry** — publishes that same verified GitHub Release tarball through npm Trusted Publishing / GitHub Actions OIDC.

The package version in `package.json` is the release version. A release tag must be exactly `v<version>`.

## GitHub Release workflow

`.github/workflows/release-github-package.yml` can be dispatched manually as an exact-head preflight. A manual run:

- runs the installed-package self-test;
- validates the rolling cache;
- runs `npm publish --dry-run`;
- builds the npm tarball;
- writes a SHA-256 checksum;
- verifies the package boundary;
- uploads the tarball and checksum as a workflow artifact.

A tag push matching `v*` performs the same checks and creates the GitHub Release with the verified tarball and checksum.

## npm Trusted Publishing workflow

`.github/workflows/release-npm.yml` runs only for `v*` tag pushes in the canonical repository. It uses GitHub Actions OIDC and must not use a long-lived `NPM_TOKEN`.

Before publishing, it requires:

- the tag to match `package.json.version`;
- the workflow SHA to be the tag commit;
- the tagged commit to be reachable from `origin/main`;
- successful exact-head runs of Stage 6 and the GitHub release preflight;
- package self-test and cache validation;
- a clean `npm publish --dry-run`;
- the matching GitHub Release tarball and SHA-256 file.

The npm workflow downloads the verified GitHub Release tarball, verifies its checksum and package boundary, and publishes that exact tarball. It then waits for registry visibility, installs the published package into a clean consumer, tests the public imports and CLI shims, runs the installed package self-test and cache validation, and verifies npm signatures/attestations.

Trusted Publishing configuration for this package is:

- provider: GitHub Actions;
- GitHub owner/user: `Sargon-17-Green`;
- repository: `Pastafarian-Calendar-Seer`;
- workflow filename: `release-npm.yml`;
- GitHub environment: none;
- direct `npm publish`: allowed.

The workflow grants only `contents: read`, `actions: read`, and `id-token: write`.

## One-time package bootstrap

The one-time bootstrap is complete. Version `0.1.2` was created in the public npm registry by publishing the already verified GitHub Release tarball with SHA-256:

```text
471251e3f3a884341d8346e502d7bb9e411f9cb5b0c6f31f2a9027aff4e99e4a
```

The bootstrap used interactive npm web authentication with account-level 2FA. No repository npm token was created. After the package existed, the GitHub Actions trusted publisher described above was configured and verified, and the temporary local npm credential was revoked with `npm logout`.

Version `0.1.2` therefore has normal npm registry signatures but no CI provenance attestation. Every later release is published only by the OIDC workflow, which requires and verifies npm provenance.

## Release safety rules

Create a tag only from a commit already verified by the relevant exact-runtime workflows. The release workflows reject a tag whose version differs from `package.json` or whose commit is not reachable from `origin/main`.

The release tarball must not contain repository-only material such as `HANDOFF_*`, `.github`, deployment/test fixtures, examples, API tests, or source test directories.

Never commit an npm credential, add a long-lived npm token merely to make publishing work, publish from an arbitrary working tree, force-move a release tag, or overwrite an existing npm version.
