# Full-year exports under a real 512MiB virtual-space limit

Date: 2026-11-07. Separate experiment; no production changes.

## Motivation

Earlier [run 42358871316](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42358871316) passed 108 complete R/Y/D replies and three selected *R* requests in a long year under Linux `RLIMIT_AS=512MiB`. This does not establish that building and returning **an entire year of day records** is possible under that constraint.

## Deterministic scope

For both calculation JDNs `2461290` and `2461400`, request native full-year export `Y c year 1` for years 4999, 5000, 5001 (six total independent cases).

For every case:
1. Launch unchanged native Seer and research `experimental42` each without a virtual-memory cap. Confirm **complete parsed JSON equality**, including the number of returned day records, inclusive start/end JDN, first/last day identities, full month/cutlet structures and every daily record.
2. In a separately launched research process, install a 512MiB `RLIMIT_AS` limit before the full-year request; verify the effective kernel limit from `/proc/PID/limits`. Request the same full-year reply and compare the entire JSON to the original when it succeeds.
3. Record successful parity, peak VM and RSS. Capture any refusal, allocation failure, response error or process crash as an explicit negative result; do **not** reinterpret CI green status as memory-cap success. A native calendar mismatch, even without a cap, always fails the test.
4. Make no speedup claim from this probe. Keep cache budgets at zero; cold construction is the relevant activity.

This is only an exploratory Linux VM-space test on six full-year cases, **not** a physical RSS guarantee, general minimum memory bound, or proof for all years. Existing 64MiB memory-profile work remains independent and unchanged.

## Completed evidence and limitation

[Run 42360658075](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42360658075) completed SUCCESS on AMD EPYC 7763. The six uncapped full-year responses matched the unchanged original Seer JSON in full, including all 25,952 records. All six capped processes independently succeeded with `RLIMIT_AS=512MiB` and returned the same full JSON. Maximum observed VmPeak 456996KiB (446.29MiB), maximum VmHWM 73344KiB (71.63MiB). Record-level results and SHA-256 response digests are in `results/ci-2825ba6b9d8d/full-year-512.json`. This verifies only the selected years/calculation days on this Linux host.

After completion, the test harness was hardened so any assertion failure involving a capped response (including a wrong day or an incorrect year boundary) cannot be misclassified as an ordinary resource-limit failure. That *harness change* is separate from the completed run and requires its own subsequent CI verification; no new engine calculation logic was altered.

See [33_FULL_YEAR_512_RESULTS.md](33_FULL_YEAR_512_RESULTS.md).
