# Architecture of the current prototype

This document describes the **current benchmark baseline**, not a frozen public API.

## Data flow

```text
(calculation day, target day)
        |
        v
specialized canonical Sauce arithmetic mod (2^127 - 1)
        |
        v
fixed generated positive gate-gap corpus
        |
        v
anchor year + year walk
        |
        v
cutlet/month structural selection
        |
        +--> cutlet partition/name unranking
        +--> exact 320-bit month-length DP
        +--> month-name unranking
        |
        v
RNS/CRT weave count
        |
        v
prefix-only weave unranking to target offset
        |
        v
numeric five-field result
```

## Fast Sauce field backend

The prototype uses specialized arithmetic modulo `M = 2^127 - 1`. In each of the 12 final post-stirs,
all six bowls read the same old snapshot. The preserved value `R = SAVE(sum(oldBowls) + 149*r)` is used
both for the lexicographic permutation and as the additive sum term inside `u`. This saved-sum rule is
covered by an intermediate-state conformance test rather than inferred from final-output agreement.

## Gate corpus

`prototype/data/gates_u16.bin` stores 40,000 generated positive canonical gate gaps. The current digest is
`2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb`. The corpus is reproducible from
`prototype/tools/generate_gates_saved_sum.cpp`; see `DATA_PROVENANCE.md`.

## Structure selection

The engine performs exact rank selection for cutlet count, cutlet partitions, canonical name indices,
month count, month lengths, and month names. Large rank spaces use exact integer arithmetic as required.

## Month-length DP and weaving

Month-length counting uses a fixed 5×64-bit (`320`-bit) exact representation. Weave count/unrank uses RNS
with fixed primes and exact CRT certification. A floating predictor may guide work, but certification remains
exact. Both the preserved AVX-512IFMA backend and portable scalar-lane backend implement the same state
machine. Only the prefix needed for the target day is materialized.

## Non-goals of the current prototype

The current baseline is not yet a stable ABI/API, web service, localization layer, or complete replacement
for every domain supported by the normative project. The bundled gate data still covers positive indices only.
