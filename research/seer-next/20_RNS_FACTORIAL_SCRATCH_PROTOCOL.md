# RNS factorial scratch pool experiment: protocol, not evidence

Date: 2026-11-07. This is isolated to the AVX2 research cold-probe source.

In the original `RnsEngine::build_pack`, one `std::vector<V8> fact(total+2)` is allocated, populated and freed for **each group of eight residue primes**. Year 5000 measurements showed 658 residue primes (83 packs) and total ~4047, so the original may allocate/free an approximately 130KiB factorial scratch table 83 times (not concurrently). Factorial scratch is **not** the permanent inverse table `q.inv`, which remains in every pack.

The experimental `SEER_NEXT_RNS_FACT_POOL=0|1` flag defaults to 0. The 0 mode performs the original allocate-and-free for each pack; 1 uses a C++ `thread_local std::vector<V8>` per OpenMP worker so each worker resizes scratch on first use and reuses it on subsequent packs/requests. Every element 0..maxv-1 is overwritten before use, so no arithmetic value depends on prior pack contents. No pointer to scratch is shared between threads; the immutable month-vector and residue structures are unchanged.

**Tradeoff:** fewer allocator calls but a small per-worker resident heap increase. Its effect on real wall time, VmPeak and VmHWM is uncertain. This is not suitable for an unconditional memory-profile adoption without tests.

The new CI job uses two order-rotated trials of 26 distinct request contexts each, comparing original service with both experimental configurations in full JSON. Both experimental configurations explicitly set `SEER_NEXT_RNS_SHARED_PLAN=0` so the prior rejected Pascal-plan experiment cannot confound this one. It measures per-pack factorial+inverse, Pascal and DP worker-time sums, and process high-water RSS/virtual memory at trial completion. No global performance guarantee follows from two hosted-runner trials.

**Decision gate:** accept no change without verified complete response parity; reject if speed change is negligible/negative or memory cost unacceptable. Keep the original seer source, main branch, and production runtime untouched.
