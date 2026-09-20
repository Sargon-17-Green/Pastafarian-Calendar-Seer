# Native diagnostic CI

The native diagnostic workflow is intentionally separate from the performance build.
Production/release binaries continue to use the existing optimized build scripts; diagnostic
binaries use `prototype/scripts/build_native_diagnostic.sh` and are never packaged.

## What runs

- GCC warning builds for both portable and AVX2 production backends.
- Clang warning builds for both portable and AVX2 production backends.
- AddressSanitizer (ASan) on a small independent exact/conformance corpus.
- UndefinedBehaviorSanitizer (UBSan) on the same corpus.
- Sanitizer execution covers portable and, when the runner exposes AVX2, the AVX2 backend.
- `_GLIBCXX_ASSERTIONS` is enabled only in diagnostic builds.

The warning profile includes `-Wall`, `-Wextra`, `-Wpedantic`, `-Wconversion`,
`-Wformat=2`, `-Wundef`, `-Wimplicit-fallthrough`, `-Wnull-dereference`,
`-Wmissing-field-initializers`, `-Wmisleading-indentation`, and
`-Wunused-parameter`. `-Wsign-conversion` is deliberately disabled: in this numeric kernel it
mostly reports signed loop indices crossing STL `size_type` boundaries and obscures the
value-loss conversions that `-Wconversion` is intended to catch here.

## Warning policy

Warnings are collected first and classified after compilation; the compiler is not invoked with
a blanket `-Werror`.

| Category | CI behavior | Policy |
| --- | --- | --- |
| `real-warning` | fail | Production warning that needs a source fix. |
| `intentional-extension` | allow and report | GNU/Clang `__int128`/`__uint128_t` exact-arithmetic extension in the explicitly listed production files. |
| `benchmark-only` | report, not a production defect | Warning whose source path is benchmark/research/tooling code rather than the production runtime. |
| `false-positive` | allow only by exact rule | No blanket suppression. Each exception needs a path+message rule and rationale. |

The current false-positive allowlist is empty. The intentional-extension rule is narrow and does
not suppress other `-Wpedantic` diagnostics.

## Sanitizer corpus

The sanitizer corpus keeps runtime bounded while still crossing the important native boundaries:

1. two canonical positive witnesses (`same-query` and `far-past`);
2. Foundation exact;
3. a calculation/target pair crossing Foundation;
4. independent-oracle equality for the batch engine;
5. cross-checks of year locator, year structure, and persistent engine service against the same
   sanitized production core.

The edge shortcut is disabled for the sanitizer run so the weave path is exercised even if a
witness happens to land on a year edge. ASan uses leak detection and aborts on the first finding;
UBSan is non-recovering and prints a stack trace.

## clang-tidy / cppcheck

Neither is a gating job yet. A broad uncurated run over the dense exact-arithmetic and SIMD/RNS
code has not demonstrated an acceptable signal-to-noise ratio. CodeQL C++ remains separate.
clang-tidy or cppcheck should be added only with a curated check set and a clean reviewed baseline,
not as a blanket warning generator.
