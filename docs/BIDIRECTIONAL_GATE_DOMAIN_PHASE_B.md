# Bidirectional gate-domain — Phase B: runtime integration

Phase B integrates the Phase A negative gate corpus into the exact runtime without replacing or rewriting
the long-verified positive corpus. Gate 0 remains Foundation on the JDN axis at `-13334246`.

Runtime gate indices now cover `-40000..40000`:

- `prototype/data/gates_u16.bin` stores `positiveGap(1..40000)`;
- `prototype/data/gates_negative_u16.bin` stores `negativeGap(1..40000)`;
- the two files remain separate and have independent provenance digests.

`FGates` reconstructs absolute gate positions around Foundation. `fanchor`, `NEXT`, and `PREVIOUS`
operate on explicit `min_index()` / `max_index()` bounds rather than assuming index 0 is the lower bound.


The persistent OPT-06 service identity includes SHA-256 of the service binary and both gate corpora.
The rolling-cache engine fingerprint uses the exact eight-file production native source closure plus both
corpora, so research-only source changes do not invalidate cache data while any runtime/data change does.

Phase B verification retains all checked-in positive canonical vectors, compares full records before
Foundation against the independent exact oracle, exercises the public query layer with the persistent
service required, and checks the npm package contains both corpora. The bundled horizon is finite;
Phase B does not claim unbounded normative coverage.
