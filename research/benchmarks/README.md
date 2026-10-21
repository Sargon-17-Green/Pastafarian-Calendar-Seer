# Research benchmarks

High-similarity A/B benchmark variants live under `src/` so they are visually separate from the production native closure in `prototype/src/`.

The `research-benchmark-*` and `research-check-*` workflows remain manual/dispatch research workflows and are not release gates. Their build/check drivers remain under `prototype/scripts/` where they can reuse the canonical verification harness; those drivers reference sources here explicitly.

Historical experiment narratives and checksum ledgers are preserved under `docs/history/benchmarks/`.
