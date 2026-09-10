# Pastafarian Calendar Seer — canonical saved-sum correction delta

Target repository: `Sargon-17-Green/Pastafarian-Calendar-Seer`  
Target branch: `main`  
Required base/observed HEAD: `def451e555a53d3ec28bb834349e8b28b6360589`

This is an overlay delta only. No commit, push, release, tag, or deletion is performed by this package.
Extract it at the repository root. There is no `DELETE_PATHS.txt` because this correction deletes nothing.

## Semantic correction

Before this delta, both `sauce_fast127_v3.hpp` and `sauce_fast127_v12.hpp` computed the saved post-stir
order value `R = SAVE(S + 149*r)` but used the raw bowl sum `S` inside `u`. The corrected implementation
uses the same saved value `R` both for the lexicographic permutation and for the additive sum term in `u`.
All six new bowls in each of the 12 final post-stirs read one common old six-bowl snapshot and are committed
together.

The optional `FSauceTrace` hook added to both fast headers is test instrumentation only. Existing three-argument
`fast_sauce` callers remain source-compatible.

## Derived data and vectors

The positive 40,000-gap corpus was regenerated from an independent exact Boost `cpp_int` reference:

- new SHA-256: `2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`
- count: 40,000
- min/max: 42 / 963
- sum: 20,067,200
- 39,956 of 40,000 records differ from the superseded raw-sum corpus
- final positive gate point from Foundation: 6,732,954

The same independent reference, deliberately switched to the historical raw-sum mutant, regenerates the old
corpus exactly: SHA-256 `57d20ac6653e9cbd1d33a5e591bb6b65a39bc0c6ec90b3af1b978d3f7ec6fdbc`,
sum 20,176,753. This is retained as provenance evidence, not as current truth.

`prototype/data/canonical_saved_sum_vectors.tsv` contains 12 independently checked full-date witnesses covering
Year 5000 start/interior/end, Year 5001 start, cutlet and month boundaries, `c=t`, `t<c`, `t>c`, a 3,540-year
past walk, and a 994-year forward walk inside the corrected positive gate corpus.

## Validation actually run while preparing this delta

- Independent exact Sauce reference vs corrected v3: PASS — 266 cases, 3,458 bowl checkpoints, 17,556 descriptors.
- Independent exact Sauce reference vs corrected v12: PASS — same coverage.
- Targeted first-post-stir raw-sum mutant discriminator: KILLED.
- Call-order check `A -> B -> A`: PASS; repeat with fresh `fast_stones()`: PASS.
- Independent full 40,000-gap regeneration: byte-identical to checked-in corrected corpus.
- Independent raw-mutant 40,000-gap calibration: exact old SHA-256 reproduced.
- Corrected fast v3 gate validator: `bad=0`, min 42, max 963, sum 20,067,200.
- Corrected fast v12 gate validator: same.
- Independent full-calendar oracle: all 12 canonical TSV vectors PASS in one complete run.
- Corrected v3 vs v12 5,000-case full Sauce dump: byte-identical; SHA-256
  `4d9f799a284e15c7dd8abe340ef8b9cde4fce7d9dfb757c7adf67d22d7b7a3e6`.
  This is regression evidence only, not semantic authority.
- Real corrected v12 year-walk source was compiled against the new corpus and matched the independent year/gate
  expectations for Year 5000, Year 5001, far-past, and forward witnesses.
- All staged Bash scripts: `bash -n` PASS. All staged Python scripts: `py_compile` PASS.
- Historical preservation check: removing only the added superseded banners reconstructs the exact original Git
  blob SHA for all 11 historical reports and all 6 historical checksum ledgers.

## Prepared but not executed here

The complete repository could be read through the GitHub connector but could not be cloned into the local build
container, so the full portable/AVX2/IFMA cold-conversion binaries were not rebuilt end-to-end in this final
packaging workspace. Their checker scripts now validate every tested binary directly against the independent
canonical TSV rather than treating Seer-to-Seer equality as authority. The updated GitHub workflows also place
the saved-sum conformance gate before benchmark interpretation.

PowerShell was not installed in the packaging environment. The changed `.ps1` benchmark runners were therefore
not parsed/executed by PowerShell here. GitHub Actions were not run because this task intentionally does not push.

## Historical material

Pre-correction benchmark/adoption reports are retained, not rewritten. Each affected report is prominently marked
`HISTORICAL — SUPERSEDED SEMANTIC VALIDATION`. Historical checksum ledgers keep their original checksum lines under
a superseded header. The old root scratch `SHA256SUMS.txt` is preserved in
`HISTORICAL_ROOT_SHA256SUMS_PRE_SAVED_SUM.txt`; the package root `SHA256SUMS.txt` is now the checksum ledger for
this delta.

See `DELTA_MANIFEST.json` for the exact path inventory and per-file SHA-256 values.
