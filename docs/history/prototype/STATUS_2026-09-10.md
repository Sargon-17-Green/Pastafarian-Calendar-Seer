# Status of this benchmark baseline

## Included baseline

- C++20.
- Canonical saved-sum Sauce fast field backend v12 (`2^127-1`), with v3 retained as an explicit regression implementation.
- Separate generated fixed gate datasets, 40,000 positive and 40,000 negative gaps.
- Fixed 720-permutation table.
- K=8 predictor micro-reset and SB=512 default.
- Static RNS primes and exact RNS/CRT certification.
- 320-bit exact month-length DP and prefix-only weave unranking.

## Current correctness evidence

The 2026-09-10 correction is validated independently of v3/v12 mutual agreement:

- 266 Sauce `(calculation,target)` cases per header, including Foundation vicinity, `c=t`, both directions,
  negative-axis inputs, and 256 deterministic random cases.
- 3,458 bowl checkpoints per header: immediately after visible drop 46 and after each of all 12 final post-stirs.
- 17,556 descriptor comparisons per header.
- A targeted raw-sum mutant is killed at the first post-stir for the discriminator witness.
- v3 and v12 corrected 5,000-case dumps are byte-identical, SHA-256
  `4d9f799a284e15c7dd8abe340ef8b9cde4fce7d9dfb757c7adf67d22d7b7a3e6`.
- The complete regenerated positive 40,000-gap corpus passes the fast validator; SHA-256
  `2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`.
- The independently generated negative 40,000-gap corpus passes both fast validators; SHA-256
  `90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab`.
- Independent reference machinery reproduces the complete old gate corpus when deliberately switched to
  raw-mutant mode; the independent full-date oracle verifies the new saved-sum canonical vector corpus in
  `data/canonical_saved_sum_vectors.tsv`.

### HISTORICAL — SUPERSEDED

The old claims that v3 matched a previous exact implementation, that v3 and v12 matched each other, and
that the former 40,000-gap corpus/hash was canonical were affected by a shared raw-sum error. The former
gate SHA-256 `57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc`
and old Year-5000/far/forward tuples are archival only. See `../HISTORICAL_VALIDATION_NOTICE.md`.

## Known limitations

1. This is a benchmark prototype, not the complete public calendar API.
2. It prints numeric cutlet/month name indices rather than localized names.
3. The bundled gate datasets cover gate indices `-40000..40000`; this remains a finite runtime horizon.
4. Extreme weave ranks can still trigger many predictor splits.
5. Absolute benchmark timing is machine-dependent.

The saved-sum correction changes semantics only; it does not advance unrelated development stages or
roll back later performance work.
