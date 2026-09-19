#pragma once

template <class Int>
static inline Int seer_short_selection_accepted_o1(
    const Int& M, const Int& N, const Int& c, bool forward) {
    const Int L = (M / N) * N;
    if (c <= L) return c;

    // Rejected short-selection values form the contiguous tail (L, M].
    // Forward first reaches accepted value 1 after wrap; backward first
    // reaches accepted value L, so iterating the rejected tail is unnecessary.
    return forward ? Int(1) : L;
}
