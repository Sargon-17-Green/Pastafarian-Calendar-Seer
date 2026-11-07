# Seer Next: archived four-platform baseline probe (2026-11-06)

**Source:** GitHub Actions [run 42284571453](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42284571453), completed success in all four matrix jobs. This is **SMOKE**, with one first request and three warm repeat requests per backend, **not** a full product performance baseline and **not** an A/B speedup.

- Unchanged native source baseline commit: `7f1b3098332d891a9ea6cf8e31383d4fd39141cf`.
- Research head at execution: `44fae96a5324b2b0e431382c5857f9acd950e63a`.
- Calculation JDN: 2461290. Non-edge target JDN: 2460984; alternate non-edge target 2461290.
- Independent numeric reference: `prototype/BENCHMARK_CASES.md`. The verified hashes of full eight-field records agree on all four platforms.
- All timings are native-service **pipe wall time in ms**, not CPU, end-to-end cold process startup or guaranteed latency.

| Environment | First request | Same target p50 of 3 | Alternate targets p50 of 3 | Weave events, repeated 3 |
|---|---:|---:|---:|---:|
| linux-amd64-avx2 | 108.196 | 92.158 | 88.189 | 3 |
| linux-amd64-portable | 274.566 | 231.378 | 233.258 | 3 |
| linux-arm64-portable | 185.016 | 174.896 | 174.047 | 3 |
| windows-x64-portable | 205.121 | 186.847 | 189.016 | unverified (raw 0) |

**Result:** Each of the three Linux platforms produced one weave per repeated internal-year request and zero weaves for `Y c 5000 0`. This confirms the source-inspection recomputation hotspot for these runs.

**Windows caveat:** The original probe read text lines by `split('\n')` and compared them without trimming; Windows native instrumentation uses text-mode output and likely CRLF. Thus its reported `0` weave events are **INVALID AS EVIDENCE** of no recomputation. The follow-up change normalizes trailing `\r` and adds strict assertions that the first request produces one weave and three repeated requests each produce three weaves. Windows numeric outputs and timings remain valid.

**Historical failure:** [run 42283490299](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42283490299) failed because the probe sent space-delimited commands to a tab-delimited service; corrected in `ed36fa548b5111366c3f2b38ff70e19155f37918`. That failure was of the harness, not evidence of a Seer defect.

The four adjacent JSON files preserve all raw samples, SHA-256 binary and gate hashes, CPU names, probe result fields and run/job IDs. Public product SMOKE artifact ZIPs and full logs remain accessible from the run page subject to GitHub retention; they are not silently called full benchmark measurements.

Next: accept corrected strict Windows instrumentation; extend sample count, gather process-tree resource metrics, then implement an isolated memory-bounded full-year reuse candidate.
