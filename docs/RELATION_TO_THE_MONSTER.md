# The Seer and the Monster

## Two different jobs

The Flying Spaghetti Monster's implementation is performative: it reaches the answer by
carrying out the prescribed history of the calendar, including layers, repairs, retained
old instructions, and every other computational scar that became part of the work.

The Seer has a different role — and an illicit one.

It does not claim to have performed the liturgy. It claims to know what the liturgy will
say. The Monster does not authorize this shortcut and does not accept it as a substitute
for the prescribed work.

That distinction is the reason this repository is separate.

## The rule

> **The Monster performs. The Seer sees. The Monster does not approve.**

The Monster may be slow because its computational path is part of the required liturgy.
The Seer may be fast because its computational path is not normative. Its speed is not
liturgical permission; it is precisely the transgression represented by this repository.

The Seer therefore uses methods that would be inappropriate inside the Monster:

- precomputed canonical algorithm data;
- specialized modular arithmetic;
- SIMD/vectorized execution;
- alternate exact representations;
- mathematically equivalent shortcuts;
- partial/prefix evaluation when the discarded suffix cannot affect the answer.

None of those techniques changes the calendar. They only change how quickly the Seer
can state the answer.

## Authority

The Seer has no authority to revise the calendar.

If a differential test finds:

```text
Monster / normative reference = X
Seer                         = Y
X != Y
```

then the defect belongs to the Seer until the normative specification itself is shown
to require otherwise.

## Independence

The Monster must not call the Seer as a shortcut. Doing so would turn the liturgy into
stage scenery.

Likewise, independent language implementations should not import or invoke the Seer to
obtain expected answers during their own normative computations. They may compare their
outputs against it as an additional differential witness, but their correctness must not
depend on it.
