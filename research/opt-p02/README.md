# OPT-P02 validation candidate

Status: **validation only; not adopted**.

The production default remains one persistent exact-service worker. This branch carries the OPT-P02 candidate as a content-verified research patch rather than changing runtime source directly.

`apply-candidate.mjs` reconstructs the candidate, verifies the canonical patch SHA-256 and the ported file hashes, requires `git apply --check`, applies the corrected product-concurrency benchmark edits, and asserts that the default worker count is still 1. The only intentional byte-level port delta from the original overlay is `query/index.mjs`, which preserves the three-line locale validation added to `main` after the OPT-P02 baseline.

`research-opt-p02-validation.yml` runs:
- targeted candidate regression tests and package self-test;
- two repetitions of 1-worker versus 2-worker service pools;
- concurrency 1, 8, 32, 128, and 300 with the same 300-target corpus;
- Linux amd64 AVX2, Linux amd64 portable, Linux arm64 portable, and Windows x64 portable;
- Windows fetch-error cause capture.

No queue limit is raised and no performance threshold is encoded. Adoption, if any, requires review of the four-platform artifacts.
