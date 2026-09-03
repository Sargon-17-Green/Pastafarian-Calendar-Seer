# AVX2 Pascal-ladder A/B delta

Target repository: `Sargon-17-Green/Pastafarian-Calendar-Seer`
HEAD re-verified before packaging: `28cd1c7398d875027f9b5bf38c40954a55055d10`.

This delta does **not** change the default engine. It adds an A/B candidate for RNS weight-table construction.

## Exact identity
The current constructor builds repeated-length weight rows by modular recurrence:

`w_n(r) = C(n+r-2, r)`.

The candidate groups repeated month lengths whose adjacent `n` values differ by at most 3. In each group it computes only the first row multiplicatively, then derives subsequent rows with the exact hockey-stick identity:

`w_(n+1)(r) = sum_{j=0..r} w_n(j)`.

All operations remain modulo the same RNS primes. No approximation, query cache, memoization between conversions, or predictive precomputation is introduced.

## Local validation before packaging
- worst 47-month / 5778-ish RNS count reconstruction: PASS;
- fraction validation: PASS;
- midpoint + deterministic random rank, SB 64/128/256/512: PASS;
- six full calendar witnesses baseline == candidate: PASS.

The strongest local signal was on the 3576-year far witness: in a 10-round interleaved comparison, RNS construction won 10/10 rounds and median `rns_count` fell from about 63.8 ms to 44.4 ms. Hosted EPYC A/B is required before adoption.

## Run
After overlaying this ZIP at repository root, run GitHub Actions workflow:

`Seer AVX2 Pascal-ladder A-B`

Defaults: 5 repetitions, 2 s cooldown, count threads 4, replay threads 2, SB512.
