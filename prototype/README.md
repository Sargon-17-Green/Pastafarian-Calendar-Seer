# Native runtime and verification harness

`prototype/` is a legacy directory name. It now contains two distinct classes of material:

1. **Production native closure** — the native sources, gate data, and build entry points explicitly shipped by `package.json` and used by the exact runtime.
2. **Verification/baseline harness** — tools and scripts used to validate or benchmark that closure.

Experimental high-similarity A/B source variants are intentionally separated under `../research/benchmarks/`.

The original benchmark-prototype README, status document, benchmark cases, and checksum ledger are preserved unchanged under `../docs/history/prototype/`.

For current correctness and provenance claims, use `../docs/CONFORMANCE.md` and `../docs/DATA_PROVENANCE.md`.
