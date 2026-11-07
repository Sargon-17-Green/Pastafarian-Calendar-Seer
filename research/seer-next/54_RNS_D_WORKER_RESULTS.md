# D worker concurrency 1/2/3 and RNS initializer scope — completed results

Date 2026-11-07. Research source commit `9c12b1361645237ce58a5f13ec92b0ec1b852222`, completed [CI 42401300070](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42401300070) SUCCESS. Raw: [rns-d-workers.json](results/ci-9c12b1361645/rns-d-workers.json). Host Intel Xeon Platinum 8573C, Linux x64.

## Exact scope

Two calculation JDNs × two trials × D dispatcher worker counts 1,2,3 × three arms (original Seer, 2-slot thread-local candidate, 2-slot process-shared candidate) × 8 mixed R/Y/D requests = **288 complete native wire replies**, each candidate deep-equal to original. A further 8 original +8 thread-local +8 process-shared requests under verified effective RLIMIT_AS=536870912 bytes, **D=1 only**, passed. Exact two-key cache misses, scope diagnostic schemas and full R/Y/D replies were validated.

| D workers | Thread-local total (4 contexts) | Process-shared total | Thread-local peak VmHWM | Process-shared peak VmHWM | Shared-vs-thread memory |
|---|---:|---:|---:|---:|---:|
| 1 | 17370.720ms | 17350.298ms | 147564KiB | 147828KiB | +0.18% |
| 2 | 16155.704ms | 16410.139ms | 263952KiB | 203664KiB | **-22.84%** |
| 3 | 19252.777ms | 19033.598ms | 367128KiB | 252588KiB | **-31.20%** |

The original Seer (no shared initializer) was also measured on the same D-heavy script: total wall 36206.945ms for D=1, 20348.515ms for D=2, 18284.519ms for D=3; do **not** present candidate D=2 as faster than original D=3 on this single host. For *both research candidates*, D=3 increased wall compared with D=2. The gains from sharing at D=2/3 are memory savings, not established throughput improvements. Total cache hit counts were small because D worker threads do not necessarily receive repeated structurally identical years.

The cold-probe peak *virtual* memory also grew from approximately 414016KiB for D=1 to 637204KiB (thread D=2) and 992800KiB (thread D=3); process sharing does not make virtual-address reservation disappear. Under 512MiB with **D=1** alone, VmPeak=414016KiB and sample VmHWM 141480KiB thread-local vs 141944KiB shared. Neither D=2 nor D=3 has passed this 512MiB mixed protocol; a previously completed 512MiB D=2 test failed with Resource temporarily unavailable.

## Decision

Preserve opt-in scopes, preserve Seer and all defaults. On this hardware, D=2 is the lower-time Pareto candidate, while the process-wide two-slot immutable cache trades roughly 1.57% increased total wall for 22.84% less observed peak RSS versus a thread-local two-slot cache. The comparison is nonportable and not a byte-budget guarantee. Next establish a true Linux `RLIMIT_AS` success/failure frontier under multiple caps (512,768,1024,1280MiB) before proposing a safe D dispatcher policy under memory constraints.
