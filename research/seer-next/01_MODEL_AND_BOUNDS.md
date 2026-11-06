# Seer Next: formal model and limits of what is proven

Status: analysis hypotheses and elementary conditional proofs only. A global complexity lower bound for the full canonical calendar has **not** been proved.

## Function and state

Let `c` be the exact calculation-day JDN and `t` the exact target-day JDN, both within the supported gate domain. The canonical numeric record is `F(c,t)`. Dependence on `c` is essential: year transitions and the intra-year structure are selected using that calculation day. A cache keyed only by `t` is wrong.

Define `Y_c(t)` as the canonical year containing `t`, with boundaries `a_c,b_c`; `o=t-(a_c+1)` is the zero-based offset. Let `A(c,Y)` be year structure; let `W(c,Y,o)` be the exact month-index/day-of-month information obtained by canonical weaving through offset `o`. The output is assembled from `Y_c(t),A(c,Y),W(c,Y,o)`. These are semantic dependencies, not instructions to use a particular algorithm.

Let `S` include verified fixed gate corpora, engine identity, per-c year chains, optional per-year structures/weave checkpoints, and optional materialized day records. `T(c,t|S,P)` is response time under policy `P`. We must separately record wall latency, CPU time, resident/peak memory, persistent disk, initialization cost, binary footprint, and energy if measurable.

## Conditional upper bounds and useful implications

- Existing resident year chain: for a fixed `c` with the target year already located, `byTarget` performs binary search over `n` materialized years: `O(log n)` comparisons; `byYear` uses direct indexed access. Cold traversal to a distant year takes a number of exact `fadj` transitions proportional to the year distance actually walked; this is an **algorithm bound for the current implementation**, not a lower bound for all possible algorithms.
- One immutable day record may be cached under exact `(engine + gate-data identity,c,t)`. With a cache lookup cost `H`, answer construction cost `C`, and `k` identical queries, independent recomputation costs approximately `kC`; materialization costs approximately `C + kH` (plus serialization). Hence the modelled speedup is `kC/(C+kH)`. This does not apply to cold single use, cache misses, eviction, or changes to `c`.
- A fully materialized year with `L=b_c-a_c` day records supports *indexed* lookup in `O(1)` native table operations after year location, provided the table passes identity and integrity checks. Constructing the table, maintaining it, and serializing the response are not free. The year-length ceiling documented in the current gate rules is 5778 days, while a public batch can return up to 10000 records.
- Producing `B` bytes to an external response necessarily incurs `Ω(B)` output work under a model where writing bytes costs nonzero time. This is a trivial I/O lower bound, **not** a proof about internal calendar arithmetic.
- If the cache has a strict `M`-byte budget, only configurations whose live memory and allocation spikes fit `M` are eligible. On-disk checkpoints may trade reads/space for reconstructing expensive intermediate states; they require checksums, engine fingerprint and bounded eviction.
- A fixed-c future-year chain cannot generally be reused unverified for `c+1`. Explicitly proving stability for a substructure or storing separately keyed results is required.
- Cross-day prefetch changes resource consumption but not semantics; it must be opt-in, cancelable, capped in CPU/RAM/disk, and keyed to the **future calculation JDN**, not merely the civil date.

## Optimization objective

No weighted scalar `w_t T + w_m M + w_d D` is dimensionally meaningful without normalization and declared workload distribution. Prefer **hard constraints + Pareto dominance**:

A candidate `A` dominates `B` for one fixed workload/environment if `A` is no worse on every tracked metric within uncertainty and demonstrably better on at least one, with exact correctness in both. When candidates trade resources, preserve both and select by explicit policy.

Initial candidate profiles (independently measurable):
- `one-shot`: pay no hidden persistent warmup; optimize total launch-to-result and disk footprint.
- `resident-latency`: bounded, frequently reused `c`, maximize warm p50/p95/p99.
- `memory-cap`: hard peak RSS/working-set and allocation bounds; reconstruction allowed.
- `storage-cap`: no large persistent derived data; favor computation.
- `throughput`: batch/range/concurrency, CPU and operations per second.
- `predictive`: separately opt-in bounded precomputation for known future `c`; its resource consumption must be accounted for.

## Competing research hypotheses

H1: Existing repeated non-edge exact queries spend material time rebuilding `A` and `W`; bounded per-(c,year) or per-(c,t) reuse produces a large warm improvement. **Source-supported, performance unmeasured.**

H2: For sparse targets, storing a few certified weave checkpoints rather than the full year can reduce replay work without exhausting RAM. **Unproven; may fail if weave state is too large or not serializable safely.**

H3: For a cold distant target, a different exact mathematical representation or parallel evaluation of year transitions beats the sequential anchored walk. **Unproven.** Existing OPT-07 negative result for fixed-c warm chains remains valid until contradicted by controlled measurements of another workload.

H4: A low-level Assembly kernel wins for a specific arithmetic bottleneck only after compiler-generated code, platform features and correctness are pinned. **Unproven.** A universal Assembly rewrite is not justified.

## Validation / proof obligations

For every candidate, show exact equivalence to the independent canonical rules including saved-sum `R=SAVE(S+149r)`, negative/positive gate domain and error behavior. Record assumptions separately from theorem statements. Test across `c=t`, Foundation vicinity, domain edges, both directions, cutlet/month boundaries, far-past/future, and reverse conversion. Never claim global optimality on the basis of a finite benchmark.
