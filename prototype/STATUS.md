# Status of this benchmark baseline

## Included baseline

- C++20.
- Sauce fast field backend v3 (`2^127-1`, no old KMAC/SHAKE/SHA3 code).
- fixed gate dataset, 40,000 positive gaps.
- fixed 720-permutation table.
- K=8 predictor micro-reset.
- SB=512 default.
- static RNS primes.
- exact RNS/CRT certification.
- 320-bit exact month-length DP.
- prefix-only weave unranking.

## Correctness evidence already obtained during development

- Sauce v3: 5,000 random `(calculation,target)` pairs matched the previous exact implementation for all six bowls, drop-46 order, and descriptors for relevant seals.
- The complete 40,000 canonical gate-gap corpus matched using the fast Sauce path.
- Gate dataset matches the canonical metadata; raw `gates_u16.bin` SHA-256 is `57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc`.
- Same-year and far-past five-field numeric outputs were checked against the independent BigInt oracle during development.
- RNS count/reconstruction and the unknown-unrank path were repeatedly checked against GMP/exact oracle states.

## Deliberately NOT included

- Sauce v5 (the proposed reuse of `v^2` and reference-return cleanup): not benchmarked/validated yet.
- Pascal multi-weight cache: exact experiment, but no stable end-to-end win.
- K6/K7/K10/K12/K16 variants: K8 retained.
- ratio regroup experiment: slower.
- scaled-coordinate / small-CRT edge experiments: not a general fix.
- 128-bit/saturated-big edge backends: verified experiments, not merged into this baseline.

## Known limitations

1. This is a benchmark prototype, not the complete public calendar API.
2. It prints numeric cutlet/month name indices rather than localized names.
3. The bundled gate dataset covers gate indices 0..40000; negative-gate support is not packaged here.
4. Extreme weave ranks just outside the small-edge domain can still trigger many predictor splits. Do not treat this package as final production edge handling.
5. Absolute timings from the development VM were highly noisy; local-machine measurements are the purpose of this package.

## Portable backend added after the baseline freeze

The original files listed above remain the IFMA baseline. A separate portable RNS backend
now mirrors the same eight-prime pack semantics with scalar `uint64_t` lanes. It is built
from `src/rns_micro8_portable.cpp` and selected by
`src/pastafarian_cold_bench_portable.cpp`.

Local verification before upload: the standalone portable RNS self-test reconstructed the
extreme 47-month count exactly (`count_ok=1`), passed fractional reconstruction
(`frac_ok=1`), and matched exact GMP unranking for the midpoint and a deterministic random
rank across superblocks 64, 128, 256, and 512. The five bundled benchmark vectors also
matched their documented structural witnesses; both independently oracle-checked numeric
tuples matched exactly.

This portable backend is a correctness-first fallback. Its performance is now to be
measured on GitHub-hosted machines that do not expose AVX-512IFMA.
