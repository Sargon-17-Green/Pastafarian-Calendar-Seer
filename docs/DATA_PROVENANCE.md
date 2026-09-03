# Algorithm-data provenance

## `prototype/data/gates_u16.bin`

The current prototype bundles a fixed corpus of **40,000 positive canonical gate gaps**.
The file is algorithm data used to avoid regenerating the same positive gate sequence for
every cold conversion.

SHA-256:

```text
57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc
```

The benchmark package from which this repository baseline was prepared records that:

- the complete 40,000-gap corpus matched the fast Sauce path;
- the dataset matched the canonical metadata used during development;
- the corpus covers positive gate indices only (the packaged range is `0..40000`).

## Reproducibility status

This initial repository snapshot preserves the verified data file and its digest, but it
does **not yet** contain a standalone reproducible generator pinned to an exact normative
source revision.

That is acceptable for an experimental benchmark baseline, but not sufficient for a
future production release. Before the Seer is treated as a production engine, this
repository should contain either:

1. a deterministic generator whose inputs are pinned to a normative specification or
   reference revision, plus a test reproducing the digest above; or
2. a generated-data manifest that identifies the exact external source revision and
   transformation used to produce the corpus.

Until then, changes to `gates_u16.bin` should be treated as correctness-sensitive and
reviewed as algorithm changes, not ordinary asset updates.
