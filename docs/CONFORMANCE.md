# Conformance policy

## Source of truth

The Seer does not define the Pastafarian Calendar. Its outputs must conform to the
normative specification and to independent exact/reference witnesses.

## Required verification direction

Conformance runs should compare:

```text
expected = normative/reference implementation
actual   = Seer
```

Never use majority voting between implementations to decide truth.

## Minimum future conformance suite

Before a production release, the repository should include automated coverage for:

- Foundation and Tablets anchors;
- same-day, forward, backward, and cross-Foundation queries;
- Sauce bowls and drop-46 order witnesses;
- positive and negative gates;
- Year 5000 and adjacent years;
- the 5,778-day year ceiling;
- short and wide rank selection;
- cutlet partitions and distinct-name unranking;
- month-length selection;
- month weaving count and unranking;
- final five-field numeric output;
- cold/repeated calls and call-order independence;
- adversarial values near representation and algorithm boundaries.

The current benchmark package already records substantial development-time differential
evidence, summarized in `prototype/STATUS.md`, but that evidence is not yet packaged as a
fully reproducible CI conformance suite.
