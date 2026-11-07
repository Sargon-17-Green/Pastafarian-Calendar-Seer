# Impossibility of a universal online cache guarantee with unknown costs

Date: 2026-11-06. **Formal conditional result**, not a complexity lower bound for the Pastafarian calendar itself.

## The decision problem

An algorithm processes a sequence of future requests and may *buy* a full-year materialization at once for a fixed positive cost `B`, or *rent* each request by computing its record from scratch. The day lookup cost after materialization is `h_i`. We restrict to the simple special case `B=1` and `h_i=0` for all `i`. The uncached rental cost `r_i>0` is not known to the algorithm **until after it chooses whether to materialize for request i**. There is no known positive lower bound or finite upper bound on `r_i`.

A competitive ratio compares the online algorithm's total cost with `OPT`, the optimal offline strategy that knows the whole sequence and all costs in advance.

## Theorem

In this model, no deterministic or randomized online algorithm has a finite worst-case competitive ratio, **even when the sequence contains exactly one request**.

### Deterministic proof

The algorithm must either buy before the first request or rent it. If it buys, an adversary chooses `r_1=ε>0` arbitrarily close to zero. The algorithm pays `1`, while the offline optimum rents for `ε`; the ratio is `1/ε → ∞`. If instead the algorithm rents, the adversary chooses `r_1=M` arbitrarily large. The algorithm pays `M`, while the offline optimum buys for `1`; the ratio is `M → ∞`. Thus no finite constant upper-bounds its ratio. QED.

### Randomized proof (expected competitive ratio)

Let `p` be the fixed probability that the online algorithm buys before the single request, chosen without knowing `r_1`. Its expected cost is `p + (1-p)r_1` and the offline optimum pays `min(1,r_1)`.

If `p>0`, take `r_1=ε → 0`; the expected ratio is at least `p/ε → ∞`. If `p=0`, take `r_1=M → ∞`; the ratio is `M`. Therefore no randomized algorithm has a finite expected competitive ratio either. The adversary need only choose a fixed one-request input with a rental cost, without seeing the random coin flip. QED.

## What this does and does not imply for Seer Next

- [The variable-cost 2-competitive theorem](05_VARIABLE_COST_CACHE_THEOREM.md) assumes each exact `d_i=r_i-h_i` is known before serving its request. This new result shows **why that assumption cannot be silently omitted**. It does not contradict the earlier proof.
- In a real calendar engine, `r_i` is not an arbitrary adversarial number: input `(c,t)` and known algorithms may permit useful deterministic bounds or cheap cost prediction. Therefore this impossibility theorem **does not establish** that no competitive or efficient online policy exists for Seer.
- With bounded cost ranges, probabilistic workload assumptions, partial tables, memory budgets or cheap runtime measurements, different guarantees may be derivable. Those require separate proofs, measurements and clearly stated objectives.
- It remains invalid to advertise a guaranteed 2-competitive S4+S2 production policy without measuring or proving advance savings knowledge. Current Seer Next policies are experimental heuristics with observed favorable and unfavorable workloads.

## Engineering consequence

Next study whether the estimated cost to compute a requested prefix and the cost to materialize a year can be bounded cheaply from the year structure and target offset. Compare estimates to real CPU/wall measurements. Do not convert those estimates into claimed deterministic guarantees until the relevant error bounds have been proved.
