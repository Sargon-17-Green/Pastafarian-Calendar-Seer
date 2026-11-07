# Experimental42 full-year exact export under 512MiB — six successes

**Verified source:** [completed GitHub Actions 42360658075](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42360658075), source commit `2825ba6b9d8d56facaa2576a5a43a9a27a6bce7f`. Runner AMD EPYC 7763 64-Core Processor, Linux x64. Raw: [full-year-512.json](results/ci-2825ba6b9d8d/full-year-512.json).

## Exact contract

Six independent `Y <calc> <year> 1` requests: years 4999, 5000, 5001 each under calculation JDNs 2461290 and 2461400.

Each complete output, including day-level structures, was compared in parsed JSON against unchanged Seer. Every original, uncapped research `experimental42`, and 512MiB-capped `experimental42` response was fully equivalent. The total was **25,952 day records**, with inclusive start and end validated per year. This is not a property-based all-domain proof.

## Individual cap outcomes

| Calculation JDN | Year | Returned days | Under 512MiB | Peak VmPeak | Peak RSS HWM |
|---|---:|---:|---|---:|---:|
| 2461290 | 4999 | 5766 | Full parity | 456996 KiB | 73344 KiB |
| 2461290 | 5000 | 4047 | Full parity | 455628 KiB | 39124 KiB |
| 2461290 | 5001 | 3289 | Full parity | 389484 KiB | 26948 KiB |
| 2461400 | 4999 | 4564 | Full parity | 455968 KiB | 42116 KiB |
| 2461400 | 5000 | 4422 | Full parity | 455876 KiB | 47452 KiB |
| 2461400 | 5001 | 3864 | Full parity | 455504 KiB | 30132 KiB |

The enforced `RLIMIT_AS` value was exactly 536870912 bytes for every run. The largest VmPeak was 456996KiB = **446.29MiB** (65.71MiB below the limit), and the largest VmHWM was 73344KiB = **71.63MiB**. VM memory and physical resident memory are distinct metrics; `RLIMIT_AS` is *not* a hard resident-RAM cap.

**Decision:** positive sampled resource/correctness evidence for the explicit research-only `experimental42` profile. This does **not** justify production merge, automatic choice, a 512MiB all-years guarantee, or claiming the full-year Y export is 15% faster: the speed comparisons previously reported were on **single-date cold queries**, not full-year Y exports. No changes to normal Seer or hybrid defaults.

## Follow-up

One weakness of the original probe is that its observational failure handler could also categorize some *capped assertion failures* as resource failures. All six capped outputs were successful and passed JSON equality, so this weakness did not affect the results above. A post-run fail-closed harness adjustment makes all JSON assertions and malformed responses fatal, but this harness hardening was not itself part of CI 42360658075.

Measure full-year cold/warm throughput with 3/3 vs 4/2 as a separate experiment, with repeated trials and CPU quota/memory context, before any broader performance recommendation.
