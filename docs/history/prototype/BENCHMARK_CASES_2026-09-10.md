# Benchmark and canonical vector cases

Calculation JDN for all listed cases: `2461290`.

The canonical saved-sum vector corpus is `data/canonical_saved_sum_vectors.tsv`; it is generated/checked
against an independent exact reference and is the semantic authority for Seer regression checks below the Scroll.

| Case | Target JDN | Expected saved-sum result |
|---|---:|---|
| same-start | 2458961 | year 5000; gates 31473:31479; offset 0; cutlet 5/1; month 5/1; 37 months |
| same-query | 2461290 | year 5000; gates 31473:31479; offset 2329; cutlet 14/337; month 39/69; 37 months |
| same-mid | 2460984 | year 5000; gates 31473:31479; offset 2023; cutlet 14/31; month 18/68; 37 months |
| same-end | 2463007 | year 5000; gates 31473:31479; offset 4046; cutlet 13/524; month 44/111; 37 months |
| far-past-3540y | -12829630 | year 1460; gates 974:983; offset 2683; cutlet 11/214; month 6/66; 45 months |
| forward-994y | 6700000 | year 5994; gates 39936:39944; offset 4854; cutlet 6/109; month 18/115; 47 months |

Additional checked vectors in the TSV target year, cutlet, month first-appearance/final-appearance, and
Year-5001 boundaries. `check_canonical_vectors.sh` validates all of them, not only this benchmark subset.

### HISTORICAL — SUPERSEDED

The former Year-5000 gates `31260:31266`, the 3,576-year far-past label, the former two principal tuples,
and the forward target `6788193` belonged to the raw-sum corpus. They are not current expected values.
The new 40,000-gap positive corpus does not extend far enough to support that old forward target.
