# Held-out adaptive RNS superblock — completed outcome

Date: 2026-11-07. Original experiment commit `69e157ae92f20f92edbd4b35a5a10807c0808190`. Completed [CI 42369949390](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42369949390). Raw source: [cold-adaptive-block.json](results/ci-69e157ae92f2/cold-adaptive-block.json). Runner AMD EPYC 9V45 96-Core Processor, Linux x64.

## Exact results

Four years **not previously seen in superblock sweep**, 4997/4998/5002/5003 × two calculation days × midpoint and penultimate targets × three trials × four variants = 192 complete native R reply comparisons, all deep-equal to unchanged Seer. Every row passed existing 22-column RNS timing and new seven-column block-scheduling trace. Fixed 4 RNS / 2 replay workers, all cache layers disabled.

| Policy | Total for 48 requests (ms) | Relative to fixed 512 | Contexts fastest out of 16 | Max VmPeak KiB | Max VmHWM KiB |
|---|---:|---:|---:|---:|---:|
| Fixed 256 | 4788.667 | -0.51% | 7 | 456812 | 66192 |
| Fixed 512 | 4813.160 | reference | 1 | 456812 | 66124 |
| Fixed 1024 | 4819.275 | +0.13% | 6 | 456812 | 66260 |
| Adaptive (128–1024) | 4817.576 | +0.09% | 2 | 456812 | 66200 |

Adaptive produced 48 upshifts and 21 downshifts across the 48 runs, versus no shifts in fixed controls. It was **4.43% slower** than fixed 512 for `Y4998-penultimate-c2461400` and did not dominate any fixed option. The 256 advantage on this host was small and inconsistent with the earlier static sweep, so it does not justify a global 256 default either.

## Decision

Reject this exact online failure-response control as a default candidate. Preserve reproducible data and opt-in research switch, but stop optimizing the superblock size as the primary bottleneck. RNS engine construction still consumes a material fixed per-query cost; test narrowly scoped reuse of immutable initial state across R requests, with strictly controlled memory.
