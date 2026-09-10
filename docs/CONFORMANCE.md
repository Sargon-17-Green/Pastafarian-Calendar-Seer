# Conformance policy

## Source of truth

The Seer does not define the Pastafarian Calendar. The current Scroll is the supreme semantic authority.
Reference/oracle code is useful only after it has itself been audited against the Scroll. Agreement between
multiple implementations is not evidence of truth when they can share the same bug.

## Saved-sum final post-stirs

For each final post-stir `r = 1..12`, read one old six-bowl snapshot and compute:

```text
S = sum(oldBowls)
R = SAVE(S + 149*r)
rank = 1 + ((R - 1) mod 720)

u = old[B] + 3*old[P] + 5*old[N] + R + r + position^2
new[B] = SAVE(u^2 + 7*old[P]*old[N])
```

All six `new[B]` values are committed together. The historical mutant that uses raw `S` inside `u`
while using `R` only for the permutation is noncanonical.

## Reproducible correction checks

`prototype/scripts/check_saved_sum_conformance.sh` compiles an independent Boost `cpp_int` reference and
checks both v3 and v12 fast Sauce headers at intermediate level: bowls after visible drop 46, each of the
12 final post-stirs, final bowls, and downstream descriptors. It also contains a targeted `rawSumMutant`
discriminator, regenerates the complete positive gate corpus, and checks independently computed canonical
full-date vectors.

`prototype/scripts/check_canonical_vectors.sh` applies the checked-in independent vector corpus to any
compatible Seer cold-conversion binary. Candidate A/B checks must use those canonical vectors; equality
with another Seer binary alone is not a semantic oracle.

The vector corpus covers Year 5000, year/cutlet/month boundaries, `c=t`, both query directions, a far-past
walk, and a forward positive-corpus walk. Sauce-level conformance additionally covers Foundation vicinity,
negative-axis inputs, and deterministic random inputs.

## Remaining prototype scope

The current bundled gate corpus contains positive gates only, so full end-to-end negative-gate calendar
vectors remain outside this prototype. Before a production release, the complete conformance suite should
also cover negative gates, the 5,778-day ceiling, cache/call-order independence where persistent semantic
state is introduced, and all supported public interfaces.
