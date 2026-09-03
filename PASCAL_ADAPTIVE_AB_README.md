# Adaptive Pascal-ladder A/B

Base HEAD when prepared: `2726ee877559550ed5a119ae123e3ebd35f7f682`.

This candidate changes only construction of repeated binomial-weight rows in the AVX2 RNS constructor. It uses the exact identity

`w_(n+1)(r) = sum_{j=0..r} w_n(j)`

for nearby repeated month lengths, but only when the estimated saved modular-multiply operations justify the prefix additions. Current conservative gate: at least one saved modular multiply per two prefix additions. This selects the ladder for the Year-5000 and far-past witnesses and rejects it for the forward-1002y witness.

No cross-query cache, approximation, or semantic change is introduced. The existing `rns_micro8_avx2_32x8.cpp` remains untouched in this A/B package.

Prior hosted gap<=3 result: RNS count improved 5/5 runs in same-query, same-end, and far-past; forward regressed 5/5 by ~1.6%, motivating this adaptive gate. Local byte-for-byte dumps of the complete state handed to replay were identical between base and adaptive for same-year, far, forward, and worst `[123x46,120]` weave.

Run **Seer AVX2 adaptive Pascal-ladder A-B** with defaults (7 repetitions, 2s cooldown). Timing runs before the heavy self-test.
