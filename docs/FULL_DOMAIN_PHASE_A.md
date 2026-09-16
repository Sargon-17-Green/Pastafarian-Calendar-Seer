# Full-domain support — Phase A: negative gate corpus

Phase A creates and independently verifies the negative side of the canonical gate sequence.
It does **not** change the production engine, query API, HTTP API, cache format, or current positive corpus.

The existing `prototype/data/gates_u16.bin` remains byte-for-byte unchanged. Its 40,000 records are
`positiveGap(1)..positiveGap(40000)` and retain SHA-256
`2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`.

For the engine's JDN axis, Foundation is JDN `-13334246`. The negative sequence is defined by the same
canonical rule expressed on that axis:

```text
negativeGap(n) = 41 + EqualChoice(Sauce(Foundation, Foundation-n), bowl=1, seal=1, N=922)
G_0            = Foundation
G_-n           = G_-(n-1) - negativeGap(n)
```

The Phase A binary stores `negativeGap(1)..negativeGap(40000)` in that order as little-endian `uint16`.
## Verification contract

The Phase A workflow must prove all of the following before the corpus may be committed:

1. The exact Boost/cpp_int generator in default mode still regenerates the checked-in positive corpus
   byte-for-byte and reproduces its historical SHA-256.
2. The historical raw-sum positive mutant is still reproducible at its archived SHA-256. This guards the
   generator option parsing against silently changing the established provenance test.
3. The exact reference generates the 40,000 negative gaps with `--negative`.
4. Both corrected fast Sauce implementations, v3 and v12, independently recompute every positive and
   negative gap and report zero mismatches.
5. The negative binary is exactly 80,000 bytes and is accompanied by a machine-readable manifest with
   its SHA-256, range, minimum, maximum and sum.

Only after this workflow passes is Phase B allowed to add the verified binary to `prototype/data/` and
teach `FGates` to expose negative gate indices. Phase B must preserve the JDN/linear-day distinction;
the linear Foundation day count `-15055671` is not a substitute for JDN `-13334246` inside Seer native
entry points.
