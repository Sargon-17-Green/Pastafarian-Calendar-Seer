# Adaptive Pascal-ladder default adoption

This delta promotes the already-validated adaptive Pascal-ladder RNS constructor to the canonical AVX2 32x8 backend.

## Hosted evidence used for adoption

On the 7-repetition EPYC 7763 interleaved run:

- same-query: paired total -3.89% (6/7 wins), RNS count -5.25% (6/7 wins)
- same-end: paired total -2.11% (4/7 wins), RNS count -4.81% (6/7 wins)
- far-past 3576y: paired total -5.01% (7/7 wins), RNS count -14.63% (7/7 wins), RSS -12.91% (7/7 wins)
- forward 1002y: paired total +0.18% (noise-level), RNS count -2.44% (6/7 wins), RSS -0.06%

Exactness passed for all six calendar vectors, worst-case RNS reconstruction, fraction validation, midpoint and deterministic random rank at SB64/128/256/512.

## Files changed

- `prototype/src/rns_micro8_avx2_32x8.cpp`
  - now contains the adaptive Pascal-ladder implementation.
- `prototype/src/rns_micro8_avx2_32x8_reference.cpp`
  - preserved pre-adoption AVX2 baseline for regression/A-B checks.
- `prototype/scripts/build_pascal_adaptive_ab.sh`
  - remains meaningful after adoption: reference baseline vs current default.
- `prototype/scripts/check_pascal_adaptive_default_adoption.sh`
  - checks default == explicit adaptive and semantic equality with the preserved reference on six vectors.
- `.github/workflows/hosted-check-pascal-adaptive-adoption.yml`
  - manual hosted adoption verification.

No public API, CLI, calendar formula, Sauce semantics, persistent cross-query cache, or portable backend is changed.

After upload, run **Seer adaptive Pascal-ladder default adoption check** once.
