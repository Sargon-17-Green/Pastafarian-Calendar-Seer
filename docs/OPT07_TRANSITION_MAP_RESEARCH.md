# OPT-07 — weighted transition maps / confluence research

## Decision

**DO NOT ADOPT** weighted transition maps as a production layer above OPT-06.

OPT-07 is a research result and does not change calendar semantics or production query behavior.

For a fixed calculation day `c`, define `T_c(e)` as the next closing-gate index reached from gate `e`, and `W_c(e)` as the corresponding day distance. Composition is exact: `T²(e)=T(T(e))` and `W²(e)=W(e)+W(T(e))`.

The verifier checks these identities against the canonical `fadj` transition, samples one- and two-step confluence, builds a binary-lifting table over the canonical chain, and compares its storage and lookup cost with the OPT-06 persistent chain.

OPT-06 already keeps one canonical Year-5000-anchored chain per exact calculation day. Cold construction still requires the same sequential transitions; after construction, `byYear` is O(1) and `byTarget` is O(log n), while binary lifting adds O(n log n) storage and does not improve those bounds.

Transitions must not be shared between distinct calculation days because `calc` participates in the transition selection.
