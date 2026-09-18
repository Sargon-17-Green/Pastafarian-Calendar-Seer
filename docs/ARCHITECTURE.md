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
fixed generated bidirectional gate-gap corpora
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

`prototype/data/gates_u16.bin` stores 40,000 generated positive canonical gate gaps and
`prototype/data/gates_negative_u16.bin` stores 40,000 generated negative canonical gate gaps.
Their SHA-256 digests are respectively
`2321775cd22a1156751fe506320d4afc47b27f391092645921df4b54d9ab49bb` and
`90a5cf809f19f62a87327b733d21572d739b83a383969765582cfb31cfb2b9ab`.
Both corpora are reproducible from `prototype/tools/generate_gates_saved_sum.cpp`; see `DATA_PROVENANCE.md`.

## Structure selection

The engine performs exact rank selection for cutlet count, cutlet partitions, canonical name indices,
month count, month lengths, and month names. Large rank spaces use exact integer arithmetic as required.

## Month-length DP and weaving

Month-length counting uses a fixed 5×64-bit (`320`-bit) exact representation. Weave count/unrank uses RNS
with fixed primes and exact CRT certification. A floating predictor may guide work, but certification remains
exact. Both the preserved AVX-512IFMA backend and portable scalar-lane backend implement the same state
machine. Only the prefix needed for the target day is materialized.

## Non-goals of the current prototype

The benchmark core remains non-normative. The public Node/HTTP v1 layer is stable, while localization
remain separate product work. Reverse conversion is now part of the shared query/HTTP layer and requires the complete canonical tuple. The bundled gate data now covers indices -40000..40000.
