# Exact gate-domain extension

## Result

Production uses a finite static bidirectional gate horizon of `-100000..100000`.
This is an implementation horizon, not a normative calendar limit.

The Seer Foundation on this JDN axis is exactly `-13334246`.
The separate linear-day value `-15055671` is not a Seer JDN.

Outer gate positions:

```text
gate -100000 = -63473948
gate +100000 =  36828783
```

Because `FGates::contain(day)` uses intervals `(gate[i], gate[i+1]]`,
the public exact day domain is:

```text
minimumJdnExclusive = -63473948
maximumJdnInclusive =  36828783
```

## Corpora and provenance
The immutable historical 40k corpora remain checked in:

```text
gates_u16.bin
2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb

gates_negative_u16.bin
90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab
```

Production loads:

```text
gates_100k_u16.bin
4d45f05acc6eb4dee6e53757a8c1f94da2f3de0fe4d4659b0745f15e05b147a8

gates_negative_100k_u16.bin
40bfbd7d76209c258fb7d4739f1ef9b10ac8bb38eb4f26690c1048aee0e4f884
```

Each extended file is 200,000 bytes. Its first 80,000 bytes are byte-for-byte
identical to the corresponding historical corpus.

`generate_gates_saved_sum.cpp` remains the deterministic authority generator.
Without `--count` it still produces 40,000 gaps; `--count 100000` produces
the extended corpus. Positive and negative gates are generated independently.
The gap definition is:

```text
choose_small(sauce, bowl=1, seal=1, n=922) + 41
```

Therefore every canonical gap is mathematically in `42..963`; `uint16`
is safe for every horizon while that definition remains unchanged.

## Compatibility at the old horizon

Naively exposing extra gates changes Year-5000 anchor candidates near the old
finite edge. That would change already-supported answers.

For a calculation day inside the historical 40k day domain, `fanchor()`
therefore sees the same candidate window that the old engine could see.
`fadj()` preserves that window while candidates remain available there, but
may continue into the 100k corpus once the year chain reaches the old edge.
Calculation days outside the old domain have no legacy clamp.

This preserves old-domain answers while supporting both
`old calculation -> extended target` and fully extended calculation/target
queries in both directions.

The independent oracle has a test-only `--legacy-radius=40000` option to
verify this compatibility policy without making production its own oracle.
## Verification

Fixed boundary witnesses include:

```text
gate +40000 =   6732954
gate +40001 =   6733782
gap              828

gate -40000 = -33409717
gate -40001 = -33410555
gap              838
```

`gate_domain_extension_probe.cpp` verifies `at()`, `contain()`, those
four positions, extension gaps, and the outer finite boundary.

`check_gate_domain_differential.py` verifies eight extended-domain cases
against the independent Boost/cpp_int oracle, four old-calculation to
extended-target cases with the compatibility policy, and 27 old-domain
regressions against a runtime loaded only with the historical 40k prefixes.

Public API verification additionally covers forward/reverse round trips,
year structure, ranges, typed finite-domain errors and persistent-service reuse.

## Why static 100k

On the Windows x86-64 verification host, generation of each 100k direction
took about 35 seconds. The two new files add only 400,000 raw bytes.
Measured npm package size against v0.1.4:

| Package | Packed | Unpacked |
| --- | ---: | ---: |
| v0.1.4 baseline | 245,351 B | 826,322 B |
| v0.2.0 candidate with ±100k corpora and domain documentation | 546,557 B | 1,234,357 B |

The packed increase is about 301 kB. At this scale compression, mmap,
checkpoint serialization and an on-demand disk-cache protocol would add more
complexity and failure surface than they save.

No HTTP request can trigger gate generation, so the extension introduces no
unbounded CPU job and no new resource-policy error class. Existing typed
finite-domain errors remain valid beyond the outer 100k horizon.

The persistent service loads the two production corpora once. Its identity,
and the rolling-cache engine fingerprint, include the production corpus hashes
and semantic source closure. Cache regeneration is therefore mandatory.

OPT-07 weighted transition maps remain `DO_NOT_ADOPT`. Lazy generation or a
checkpoint hierarchy should be reconsidered only if a future horizon makes
static storage materially expensive.
