# First formal result: a 2-competitive online materialization rule (restricted model)

Date: 2026-11-06. This is a mathematical claim with explicitly stated assumptions. It is **not** a proven complexity lower bound for the canonical calendar and **not** a measured Seer speedup.

## Motivation

For a fixed, exact (calculation-day `c`, canonical year `Y`) pair, Seer's current source recomputes the structure and weave prefix for repeated non-edge one-day requests. A hypothetical full-year materialization costs time and memory once and then permits cheap indexed lookups. Whether/when to materialize is an online decision: the number of future requests is not known.

## Model

One cache-eligible key `K=(engine/gates identity,c,Y)` is held for the duration of an episode without eviction. The episode comprises `k>=1` requests to any day in that year.

- A request without a materialized full-year table costs `r>0` time units.
- A request with a materialized table costs `h`, with `0<=h<r`.
- Creating the full-year table costs `B>0` additional time units and requires enough available, fixed budgeted RAM.
- Costs are deterministic and constant over the episode; `B` is known before the choice. The output, correctness and API are identical.
- We ignore concurrent competing cache keys, eviction, queueing, cache verification costs, I/O variability, CPU frequency changes and prefetch contention.
- Buying the table may be performed immediately before serving a request; that request then costs `h`, in addition to `B`.

Define the *per-request extra cost of renting* as `d=r-h>0`. Choose threshold

`t=floor(B/d)`.

**Policy:** Serve the first `t` requests without materialization. If and only if the `(t+1)`th request occurs, materialize the year once before handling that request. Thereafter use table lookups.

## Theorem

Under the assumptions above, this deterministic online policy costs no more than twice the optimal offline strategy that knows `k` in advance.

**Proof.** For any `k`, an offline strategy either rents all requests at cost `kr`, or buys once before the first request at cost `B+kh`. Delaying an offline buy can never improve cost under constant rates, since each earlier rented request costs `d>0` more than a table lookup. Thus

`OPT(k)=kh+min(kd,B)`.

Case 1: `k<=t`. Since `k d<=t d<=B`, `OPT(k)=kr`. The online policy also rents `k` times, hence `ALG(k)=OPT(k)`.

Case 2: `k>t`. Because `t=floor(B/d)`, we have `kd>B`. The offline strategy buys, so `OPT(k)=B+kh`. The online policy rented `t` requests, then bought, hence

`ALG(k)=tr+B+(k-t)h=B+kh+t(r-h)=OPT(k)+td`.

By `td<=B<=OPT(k)`, it follows that `ALG(k)<=2 OPT(k)`. This includes `t=0`, when buying immediately is optimal for every nonempty episode. QED.

## Worked hypothetical numbers (not measurements)

Let `r=4 ms`, `h=0.05 ms` and `B=80 ms`. Then `d=3.95 ms` and `t=floor(80/3.95)=20`. For `k=100` requests, online cost is `20*4+80+80*0.05=164 ms`. Offline optimum is `80+100*0.05=85 ms`, giving `164/85≈1.9294<2`. Recomputing every request would cost `400 ms`. These illustrative numbers are not Seer benchmarks.

## Applicability and limitations

This theorem **does not** imply that a full-year cache is best for Seer, nor that the engine is within factor two of the fastest possible algorithm. Actual Seer per-target replay costs vary with target offset, future request counts are unknown, and caches have finite shared memory. This policy is only a theoretical reference baseline and a candidate for restricted constant-cost scenarios.

A production policy must measure `B,r,h` accurately, account for memory opportunity cost and future eviction, avoid accidentally charging full-year construction twice, and validate exact output against the independent canonical corpus. If savings can be proved for a partial checkpoint or a per-day record instead, that strategy may dominate.

Next theoretical question: can a competitive guarantee be obtained for **variable replay costs, multi-key eviction and bounded memory**, without assuming the ability to predict future calculation-day changes?
