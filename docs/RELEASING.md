# Releasing Pastafarian Calendar Seer

The repository has two distinct distribution layers:

1. **GitHub Release** — supported by the repository itself and does not require an npm credential.
2. **npm registry publication** — requires npm ownership/trusted-publisher configuration outside this repository.

The package version in `package.json` is the release version. A release tag must be exactly `v<version>`.

## GitHub Release workflow

`.github/workflows/release-github-package.yml` can be dispatched manually as a preflight. A manual run:

- runs the installed-package self-test;
- validates the rolling cache;
- runs `npm publish --dry-run`;
- builds the npm tarball;
- writes a SHA-256 checksum;
- verifies the package boundary;
- uploads the tarball and checksum as a workflow artifact.

A tag push matching `v*` performs the same checks and then creates the GitHub Release with the verified tarball and checksum.
## Release safety rules

Create a tag only from a commit already verified by the relevant exact-runtime workflows. The release workflow additionally rejects a tag whose version differs from `package.json` or whose commit is not reachable from `origin/main`.

The release tarball must not contain repository-only material such as `HANDOFF_*`, `.github`, API examples, or API test fixtures.

## npm publication

At the time this document was introduced, `pastafarian-calendar-seer` was not present in the public npm registry and the repository had no npm publication credential configured. Do not add a long-lived npm token merely to make the workflow green.

When npm ownership is established, prefer npm trusted publishing/OIDC if available for the repository. Registry publication should reuse the same version/tag and package boundary already verified by the GitHub release path.
