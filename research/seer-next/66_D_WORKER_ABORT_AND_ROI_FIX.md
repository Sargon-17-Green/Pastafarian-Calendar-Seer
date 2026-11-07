# Research D worker abort and ROI report failure — analysis and predeclared regression

Date 2026-11-08. Parent research SHA `54e1d5d4eaa9f88887f1ed5c5b887ed318c31efa`. Run [42421321405](https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/actions/runs/42421321405) completed **FAILURE**; no new ROI evidence was archived.

## Two separate failures, no invented result

1. Independent `rns-cache-roi-avx2` job completed build, entered the 0/1/2-slot cache ROI profile and stopped with `ReferenceError: out is not defined` at line 343 after approximately six minutes. The script constructed `report` but never assigned `out=JSON.stringify(report,null,2)+'\\n'` before writing it. It did not create a valid output file; 810 full candidate replies may have been computed but **cannot be asserted equal from persisted evidence**.
2. The main `linux-native-avx2` job passed prior differential/replay/cache tests and failed in `profile_rns_cap_frontier.mjs`: a process-scoped two-slot cache with **three D workers** under an effective requested **512MiB** cap, JDN 2461400, during the first D request, produced `Native exited: null SIGABRT terminate called recursively`. The frontier harness correctly rejects this as an unexpected crash, not RESOURCE_LIMITED. Do not weaken this classifier without evidence.

## Root cause candidate and explicit remediation

The research-only `seer_next_hybrid_engine_service.cpp` D dispatcher initialized a `std::vector<std::thread>` and launched helper threads with `pool.emplace_back(work)` outside any exception-safe unwind. If creating the second helper thread throws `std::system_error`, destructing the first still-joinable `std::thread` calls `std::terminate`, potentially explaining the recursive SIGABRT. The SIGABRT alone does not prove this exact cause.

Replace the launch loop with a handler that stores an exception, marks the shared worker cancellation flag, joins every started worker, then rethrows to the existing service error handler. No modifications to original Seer. Add **test-only** opt-in `SEER_NEXT_TEST_D_LAUNCH_FAIL_AFTER=1` to deterministically throw `std::system_error(errc::resource_unavailable_try_again)` just before the second helper launch, after the first was created. This hook is absent in normal requests and does not alter production/default semantics.

For both research hybrid and cold probe, issue original-Seer-equal R, then two failing D commands, with full-wire R between and after D, and Y after failures. Demand exactly two returned native protocol errors containing `research-injected D worker launch failure`, no termination, and complete R/Y JSON equality. The isolated ROI job runs the cold probe subset as well. The regular 512MiB D=3 cap-frontier test is **unchanged**, so completed CI still must verify behavior under genuine resource pressure, not only injection.

Correct ROI report serialization by assigning `const out=JSON.stringify(report,null,2)+'\\n';` before write. Accept the ROI only when its independent job produces and archives the complete 10-arm, 810-potential-reply JSON evidence with original equality, trace validation, and zero/one/two-slot controls. A completed CI alone is insufficient if acceptedCases differs from total or a resource failure occurred.

## Constraints

All work is limited to research branch; released Seer, `main`, public/default behavior and existing scientific thresholds are unchanged. A genuine native crash with no classified allocation message remains a failed experiment requiring diagnosis.
