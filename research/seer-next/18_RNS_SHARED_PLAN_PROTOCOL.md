# RNS cold-constructor phase and shared-Pascal-plan experiment

Date: 2026-11-07. **Experiment protocol only until completed CI; no adoption or speed claim.**

Previous cold AVX2 measurements at research SHA 6796fd5c show `RnsEngine` construction taking ~44ms in three-worker mode and ~95ms in one-worker mode for representative year 5000, sometimes consuming most of a cold query. It reconstructs 658–720 prime residues in 83–90 AVX2 packs. The existing code computes a factorial-inverse table, identifies repeated month lengths, chooses Pascal-ladder groups and computes the modular DP inside each pack.

The group plan (frequency of each month length, maximum required row index, grouping by WC_LADDER_GAP, and the ladder/direct heuristic) depends **only on the immutable month-length vector**, not on any prime. Recomputing this control structure for every eight-prime pack is therefore redundant.

## Experimental change

The *separate research AVX2 source* offers `SEER_NEXT_RNS_SHARED_PLAN=0|1`, default off. With 1, the engine builds a read-only immutable group plan once in its constructor, before the OpenMP pack workers, and every worker uses the same plan. With 0, the original per-pack logic is retained. All modular factorials, inverses, Pascal coefficients, RNS residues, replay code and public calendar responses are otherwise unchanged.

We instrument every pack in the experimental source, recording worker-time spent in:
1. Factorials and modular inverses
2. Pascal-ladder table generation
3. Exact modular DP

The `SEER_NEXT_RNS_PACK_DETAIL_FILE` outputs one tabular record per RNS construction containing count, eight-prime pack count, sum of pack-worker times and maximum pack-worker time for each phase. **Sums of parallel worker times are not wall time.**

## Gate

Run 2 order-rotated trials covering 8 calculation-day contexts × 3 interior targets plus two Foundation contexts. Disable both exact-record and full-year caches; compare each resulting full JSON response to the unchanged baseline. Compare original per-pack vs shared plan in the same native service binary with flags 0 and 1, track all wall samples and internal stage sums. Require equality of RNS prime counts and month-day results before any performance discussion.

A benefit is only accepted if repeatedly measured across diverse years/cpus and without unacceptable memory costs. If the observed speedup is negligible or negative, mark DO NOT ADOPT. Do not modify main or existing public runtime.
