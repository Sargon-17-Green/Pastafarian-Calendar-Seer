# HISTORICAL — SUPERSEDED semantic validation notice

A canonical semantic correction on 2026-09-10 changed the 12 final Sauce post-stirs from the former
raw-sum mutant to the Scroll-defined saved-sum rule. The previous Seer v3 and v12 implementations shared
the same raw-sum error, so their byte-for-byte agreement could not establish canonical correctness.

Accordingly, semantic/canonical claims in pre-correction benchmark and A/B reports are historical only,
including the old gate digest, old Year-5000/far/forward vector values, and statements that a candidate was
"canonical" merely because it matched the then-current baseline. Performance observations may remain useful
as archival measurements of those exact old binaries, but they must not be reused as current semantic evidence.

This notice applies in particular to the historical Sauce/v12 adoption reports and to the AVX2 mul-small,
fracdouble, interleaved/split, Pascal-ladder/adaptive, and replay-cache A/B reports prepared before this
correction. Current semantic validation is defined by `docs/CONFORMANCE.md`,
`prototype/scripts/check_saved_sum_conformance.sh`, and `prototype/data/canonical_saved_sum_vectors.tsv`.

No historical report was silently rewritten to pretend the old experiment never occurred.
