# Unified release-candidate verification

`.github/release-gates.json` is the single machine-readable authority for the
checks that must succeed before a version tag is allowed to publish anything.
Release workflows, QA instructions, and the branch ruleset must not maintain
independent copies of the gate list.

## Exact-SHA model

Run **Verify release candidate** once against the exact commit that is intended
to become `vX.Y.Z`. The workflow freezes `github.sha`, reads the authority file,
and plans every required gate against that SHA.

For each gate, the orchestrator:

1. reuses a completed successful workflow run only when its `headSha` is the
   exact candidate SHA;
2. if an exact-SHA run is already queued or active, waits for that run instead
   of starting another copy;
3. otherwise invokes the existing gate as a reusable `workflow_call`.

`force_all=true` is a diagnostic escape hatch. It deliberately ignores reusable
evidence and runs all gates again; it is not the normal release path.

The authoritative gate categories are package/cache, semantic/full domain,
reverse, exact errors, difficult weave, persistent service, portable fallback,
ARM64 parity, Stage 5/6, web, container, supply chain, and release preflight.
The concrete workflow mapping is intentionally not duplicated here; read
`.github/release-gates.json`.

## Verification manifest

A full run uploads:

```text
release-candidate-verification-<SHA>/
  release-candidate-verification.json
```

The manifest records the exact candidate SHA, repository, orchestrator run,
SHA-256 of `.github/release-gates.json`, every required gate, and the evidence
used for that gate. `allPassed` is true only when every authority gate is
successful.

Publication workflows retrieve this artifact through
`scripts/verify-release-candidate-manifest.mjs`. They fail closed unless:

- the manifest SHA is the exact tag commit;
- the authority digest matches the authority file at that tag;
- the gate set exactly matches the authority (no missing or extra gate);
- every required gate has status `success`;
- the manifest belongs to the exact successful orchestrator run from which it
  was downloaded.

A successful manifest for an ancestor, another branch head, or another tag is
not accepted.

## Release workflow dependencies

The release-candidate manifest is the common source gate for native npm
runtimes, the root npm package, GHCR, and the final GitHub Release. Publication
dependencies remain separate from source verification:

- root npm additionally waits for the exact-SHA native-runtime publication;
- the final GitHub Release additionally waits for exact-SHA npm and container
  publication.

Those publication dependencies are not duplicated in `release-gates.json`
because they happen after the tag exists.

## Required check

`Release verification policy` is the lightweight required branch check. It runs
on pull requests and `main` and executes
`scripts/validate-release-gates.mjs`. It detects drift between the authority,
the reusable workflows, the orchestrator, release workflows, and these docs.

The entire 18-gate release matrix is intentionally **not** a pull-request
required check: the merged/tagged SHA can differ from the PR head, and repeating
the expensive matrix on both SHAs would not prove the tag commit while wasting
compute. The full matrix is an explicit exact-SHA release-candidate operation.

Maintainer static checks:

```bash
node scripts/validate-release-gates.mjs
node scripts/audit-supply-chain.mjs
```

Ordinary CI being green is useful development evidence; it is not a substitute
for a successful unified release-candidate manifest on the exact tag commit.
