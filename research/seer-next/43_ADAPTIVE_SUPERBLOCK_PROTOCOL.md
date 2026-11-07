# Online adaptive RNS superblock — held-out exact test protocol

Date: 2026-11-07. Baseline parent `1d7644c701486a2fa452fc890945044abfc308a5`. Isolated research only; no production, release or default change.

## Algorithm preregistration

With `SEER_NEXT_COLD_ADAPT_SUPERBLOCK=1` (default disabled; reject invalid nonempty values), begin the RNS weave's outer speculative scheduling at block size 512. After processing a whole outer block and its recursive exact fallbacks, compare `st.failed` to the saved counter before the block. If new prediction/certification failures occurred, **halve the next block**, minimum 128, and reset clean streak. After **two consecutive outer blocks without new failures**, double the following block, maximum 1024, and reset clean streak. Stay within exact `Unknown::process` and `certify_commit`, preserving all existing fallback and bit-exact result logic. No case identity, benchmark result, future state, oracle label or outside lookup affects the policy.

The static 256/512/1024 controls set the explicit switch to zero and preserve their old scheduling. The research-only additional trace records seven integers: mode flag, total outer blocks, failed blocks, clean blocks, upshifts, downshifts, final block. The existing RNS trace remains the same 22-column format.

## Out-of-sample acceptance

Use **four years absent from the prior block sweep**: 4997, 4998, 5002, 5003. Obtain start/end JDNs from the original Seer's Y metadata, use midpoint and penultimate targets for each, with two calculation JDNs (2461290, 2461400). This makes 16 contexts. For three trials, compare original Seer to four cold candidate policies (fixed 256, fixed 512, fixed 1024, adaptive starting at 512), at fixed 4 RNS/2 replay workers. **192 native R replies** must have exact deep JSON equality. The 22-column RNS trace and seven-column adaptive trace must exist and parse. Each static policy must have zero adaptation shifts, and all modes must obey `failed+clean=total blocks` and valid final block bounds. Each query runs in a fresh process with no memo caches and bounded timeout.

Record cold spawn-to-response wall time, RNS stages, exact certifications, failed speculations, process VmPeak and VmHWM, all block transitions, and per-input matched differences. A good aggregate without poor-tail checks or portability evidence is **not** an adoption criterion. Reject the online candidate for any mismatch, timeout, incomplete trace or serious regression.

## Constraints

Even a successful 192-reply run proves correctness only on those inputs, not all years or machines. No modifications to `main`, the original Seer sources, ordinary public APIs or default `superblock=512`. Process virtual-address-space snapshots are not hard RSS caps.
