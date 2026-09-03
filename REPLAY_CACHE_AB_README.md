# Seer replay-cache A/B/C delta

This is an experimental overlay for `Sargon-17-Green/Pastafarian-Calendar-Seer` after Sauce v12 adoption.
It does **not** change the default engine.

## Purpose
The Sauce v12 work reduced year-walk latency, leaving RNS prefix replay as a major cold-conversion cost.
The current AVX2 RNS implementation persists a direct `B` lookup only for the single most frequent repeated month length, even though `build_pack()` already computes lookup tables for every repeated length and then discards all but one.

This delta compares:

- `base`: current adopted-v12 default;
- `top2`: retains direct `B` tables for the two most frequent repeated month lengths;
- `all`: retains direct `B` tables for every month length occurring at least twice.

Both candidates also apply a semantics-preserving replay-loop cleanup:
- reuse the already computed active-row `B` value;
- fuse the `H` and `B` suffix passes;
- skip writes to `B[h]` whenever that row is served by an immutable retained lookup table.

## Exactness gates
The workflow runs:
1. the existing v12-default adoption check;
2. exact RNS self-tests for both candidates;
3. six full canonical vectors against the current baseline.

Only then does it benchmark.

## Metrics
The benchmark uses fresh processes and records:
- internal `all_ms`;
- `replay_ms`;
- `prefix_total_ms`;
- `rns_ctor_ms` / `rns_count_ms`;
- external wall time;
- maximum RSS.

The key decision is whether the replay saving is large enough to justify the retained-table memory.

## Local evidence before packaging
On the local development VM, both candidates passed the exact self-test and all six full vectors.
The `all` variant showed the strongest far-past replay reduction, but raised far-case RSS substantially (roughly 60 MiB baseline to roughly 170 MiB in one representative pair). VM timing was noisy, so no candidate is adopted from local timing alone.

Run GitHub Action **Seer replay-cache A-B-C** and return the artifact/logs.
