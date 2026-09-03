# Benchmark vectors

Calculation JDN for all bundled vectors: `2461290`.

| Case | Target JDN | Expected structural result |
|---|---:|---|
| same-start | 2461247 | year 5000; gates 31260:31266; offset 0 |
| same-query | 2461290 | year 5000; gates 31260:31266; offset 43 |
| same-mid | 2462913 | year 5000; gates 31260:31266; offset 1666 |
| same-end | 2464579 | year 5000; gates 31260:31266; offset 3332 |
| far-past-3576y | -12829630 | year 1424; gates 992:1004; offset 3135 |

Previously oracle-checked numeric tuple components for two principal vectors:

- `2461290 -> 2461290`: cutlet-name index 11, day-in-cutlet 44, month-name index 7, day-in-month 2; 29 months; weave N bit-length 15837.
- `2461290 -> -12829630`: cutlet-name index 10, day-in-cutlet 1, month-name index 8, day-in-month 64; 47 months; weave N bit-length 30497.
