# Architecture of the current prototype

This document describes the **current benchmark baseline**, not a frozen public API.

## Data flow

```text
(calculation day, target day)
        |
        v
specialized Sauce arithmetic mod (2^127 - 1)
        |
        v
fixed canonical positive gate-gap corpus
        |
        v
anchor year + year walk
        |
        v
cutlet/month structural selection
        |
        +--> cutlet partition/name unranking
        |
        +--> exact 320-bit month-length DP
        |
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

The prototype uses a specialized representation for arithmetic modulo
`M = 2^127 - 1`, avoiding a general-purpose big-integer representation for the hot Sauce
and year-walk path.

## Gate corpus

`prototype/data/gates_u16.bin` stores 40,000 positive canonical gate gaps as fixed
algorithm data. The current benchmark consumes the corpus instead of regenerating those
gaps during every cold query.

This is an optimization, not a change in semantics. See `DATA_PROVENANCE.md`.

## Structure selection

The engine performs exact rank selection for cutlet count, cutlet partitions, canonical
name indices, month count, month lengths, and month names. Large rank spaces use exact
integer arithmetic as required.

## Month-length DP

Month-length counting uses a fixed 5×64-bit (`320`-bit) exact representation. It is a
purpose-built exact counter for the bounded month-length family, not a floating-point
approximation.

## Weave counting and unranking

The expensive weave count/unrank path uses RNS with fixed primes and exact CRT certification. A floating predictor may guide work, but certification remains exact.

Two execution backends now exist for the same RNS state machine:

- the preserved AVX-512IFMA eight-lane baseline;
- a portable eight-lane scalar representation used when IFMA is unavailable.

The portable source preserves the same prime lanes and exact transitions rather than replacing them with a different counting algorithm.

Only the prefix needed to identify the target day's month is materialized. The rest of
the year's weave is not generated when it cannot affect the requested date.

## Hardware backends

The original baseline requires AVX-512F, DQ, BW, VL, and AVX-512IFMA. The portable backend removes that requirement while preserving the IFMA source unchanged. The portable implementation is currently a correctness-first fallback; further AVX2-specific tuning can follow hosted measurements.

## Non-goals of the current prototype

The current baseline is not yet:

- a stable library ABI;
- a stable C/C++ API;
- a web service;
- a localization layer;
- a complete replacement for every domain supported by the normative project.
