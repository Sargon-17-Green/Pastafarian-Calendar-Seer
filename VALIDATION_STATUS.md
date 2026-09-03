# Validation status — AVX2 RNS32x8 candidate

Locally verified before packaging:

- Worst weave vector `[123 x 46, 120]`: count/CRT exact; `frac3` exact tolerance unchanged.
- 16 rank/superblock self-test rows (mid + 3 deterministic random ranks across SB64/128/256/512): all `ok=1`, zero fallback.
- 20 full calendar conversions distributed over the positive-gate domain: zero semantic mismatches against the previously verified 52-bit AVX2 backend.
- Canonical full vectors preserved, including Year 5000 start/query/mid/end and the 3,576-year far-past case.
- Build with `-march=x86-64-v3` contains no AVX-512 / IFMA instructions.

Local interleaved medians, 10 paired repetitions, 4 threads, SB512 (machine-specific; not a hosted-runner claim):

- same-end: AVX2-52 ~83.95 ms total -> RNS32x8 ~71.67 ms total.
- far-past-3576y: AVX2-52 ~273.58 ms total -> RNS32x8 ~258.46 ms total.
- same-end replay: ~47.49 ms -> ~33.63 ms.
- far replay: ~84.31 ms -> ~65.28 ms.

The scalar GitHub-hosted baseline was much slower (about 1.38 s same-end and 1.54 s far); the purpose of the included workflow is to measure the candidate against that baseline on the same EPYC runner.
