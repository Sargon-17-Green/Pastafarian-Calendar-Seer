# A 2-competitive online cache rule for variable request costs

**Proved under a restricted cost model; NOT a Seer performance claim.** Date: 2026-11-06.

For one fixed exact key `(engine/gates identity, calculation JDN c, year Y)`, suppose request `i` costs `r_i` without a materialized year table and `h_i` with it, where `d_i = r_i-h_i >= 0` is **known before serving that request**. Buying the complete table costs a fixed `B>0` and sufficient reserved RAM. There is no eviction, contention, partial cache, future-cost dependence, or separate time-dependent startup charge. The same records are returned regardless of strategy.

**Online strategy:** initially set cumulative excess rental cost `S=0`. Before uncached request `i`, if `S+d_i < B`, serve uncached and set `S+=d_i`. Otherwise, materialize before serving request `i`, and use the table for that and all future requests.

**Theorem:** The total online cost `ALG` is at most `2 OPT`, where `OPT` is the best offline strategy with knowledge of the entire request sequence.

**Proof.** Put `H=Σh_i`, `D=Σd_i`. Because every `d_i>=0`, an offline purchase later than the first request never improves cost compared with buying at the beginning. Therefore `OPT=H+min(D,B)`.

If online never buys, `D<B`, and it pays `ALG=H+D=OPT`. If online buys before request `j`, it previously accumulated `S=Σ_{i<j}d_i<B` and `S+d_j>=B`, so `D>=B` and `OPT=H+B`. Online cost is `ALG=H+B+S < H+2B<=2(H+B)=2OPT`. QED.

The constant-cost formula in `03_ONLINE_CACHE_THEOREM.md` is a special case. This generalization matters because Seer has target-offset-dependent weave replay costs, but **the assumed advance knowledge of `d_i` is not established**. Estimates, competing cache entries, RAM budgets, evictions, prefetch work and variable materialization cost are outside the proof. It is not a lower bound on computing the calendar. No optimality claim is made for Seer under realistic workloads.
