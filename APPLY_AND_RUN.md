# AVX2 RNS32x8 candidate delta

Copy this delta over the repository root. It only adds new files; it does not replace the scalar portable backend or the preserved AVX-512 IFMA backend.

Then run GitHub Actions -> **Seer AVX2 candidate benchmark** with the defaults (3 repetitions, 4 threads, SB512).

The workflow performs:
1. scalar portable baseline build;
2. AVX2 candidate build;
3. exact worst-vector/random-rank self-test;
4. five canonical calendar-vector checks;
5. cold-process benchmark of both backends on the same hosted runner.

The candidate changes the RNS basis only: primes are near 2^32 and eight residues occupy one AVX2 register. CRT certification remains authoritative.
