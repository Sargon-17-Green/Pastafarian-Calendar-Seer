# GitHub Actions maintenance policy

This directory intentionally keeps three distinct classes of automation.

## Production verification

`verify-*.yml`, CodeQL, dependency review, gate generation, and cache verification are evidence-producing production checks. Shared mechanical setup belongs in `.github/actions/`; semantic assertions and named evidence steps remain visible in the calling workflow.

## Release

`release-*.yml` is tag-driven publication logic. Release workflows stay deliberately explicit where ordering, identity, attestations, registries, or irreversible publication matter. Maintenance refactors must not hide release evidence behind a generic abstraction.

## Historical/manual benchmarks

`hosted-benchmark-*.yml` and `hosted-check-*.yml` are preserved as historical/performance evidence and remain `workflow_dispatch`-only. They are not production gates and must not silently become pull-request or push checks.

## Shared setup

- `native-deps` owns Linux apt setup profiles.
- `node-setup` owns the single SHA-pinned `actions/setup-node` reference while preserving each caller's Node/cache/registry policy.
- `native-build` owns repeated canonical production build-script sequences.
- `contract-environment` installs the fully version-locked contract tool set from `ci/requirements-contract.txt`.
- `_reusable-ci-job.yml` owns checkout for simple jobs. Checkout cannot be a useful local composite action because the repository containing that action does not exist on the runner until after checkout.

All third-party GitHub Actions, including Actions used inside composite actions, must remain pinned to a full 40-character commit SHA. Version comments are informational only.
Node 20 remains the package minimum declared by `package.json`; release/container automation currently uses Node 24. A new Node major is adopted only after an explicit runtime-policy decision and relevant matrices pass.
