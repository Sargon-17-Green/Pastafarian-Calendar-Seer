# Sauce v12 candidate delta

This delta keeps the canonical Sauce semantics and the AVX2 RNS32x8 backend unchanged except for the Sauce arithmetic source used by the v12 comparison binary.

v12 performs two exact algebraic rewrites inside the 7 hidden and 11 visible grinds:

1. `v^2 + k*v` is evaluated as `v*(v+k)`.
2. For each visible grind, `q1*p + q2*p3 + q3*p7` is rewritten as `q1*(p+p3+p7) + (q2-q1)*p3 + (q3-q1)*p7`; the two differences are only 2/4/6/8/10 and are constructed with field additions.

No approximation, memoization, predictive precomputation, or change to CRT certification is introduced.

Local validation before packaging:
- 1,000,000 field-operation differential checks were used while exploring arithmetic variants.
- v12 full Sauce dump: 5,000 deterministic random `(c,t)` pairs, all 6 bowls, last permutation, and descriptors for bowls 1..6 with seals 1,10,11,12,20,21,22,30,31,32,33: byte-for-byte equal to v3.
- all 40,000 canonical positive gate gaps: zero mismatches; min 42, max 963, sum 20,176,753.
- six full AVX2 calendar vectors (same-start/query/mid/end, 3576y past, 1002y forward): identical semantic output.

The workflow `Seer Sauce v12 A/B benchmark` benchmarks before the heavy exact self-test and alternates v3/v12 order with 2 seconds cooldown.
