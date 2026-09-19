#include "seer_year_core.hpp"

#include <algorithm>
#include <fstream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace seer_native::detail {

std::vector<uint16_t> FGates::load_gaps(const char* filename) {
    std::ifstream f(filename, std::ios::binary);
    if (!f) throw std::runtime_error(std::string("cannot open gate data: ") + filename);
    f.seekg(0, std::ios::end);
    const std::streamoff end = f.tellg();
    if (end <= 0 || (end % 2) != 0) {
        throw std::runtime_error(std::string("bad gate data size: ") + filename);
    }
    const size_t count = static_cast<size_t>(end / 2);
    if (count > static_cast<size_t>(std::numeric_limits<int>::max())) {
        throw std::runtime_error(std::string("gate corpus too large: ") + filename);
    }
    f.seekg(0);
    std::vector<uint16_t> out(count);
    for (size_t i = 0; i < count; ++i) {
        unsigned char b[2]{};
        f.read(reinterpret_cast<char*>(b), 2);
        if (!f) throw std::runtime_error(std::string("short gate data: ") + filename);
        out[i] = static_cast<uint16_t>(b[0]) |
            (static_cast<uint16_t>(b[1]) << 8);
    }
    return out;
}

FGates::FGates(const char* positiveFilename, const char* negativeFilename) {
    const auto positive = load_gaps(positiveFilename);
    const auto negative = load_gaps(negativeFilename);
    if (positive.size() != negative.size()) {
        throw std::runtime_error("positive/negative gate corpus size mismatch");
    }
    radius_ = static_cast<int>(positive.size());
    p.resize(static_cast<size_t>(2) * positive.size() + 1);
    p[static_cast<size_t>(radius_)] = FOUNDATION_JDN;
    for (int n = 1; n <= radius_; ++n) {
        p[static_cast<size_t>(radius_ - n)] =
            p[static_cast<size_t>(radius_ - n + 1)] - negative[static_cast<size_t>(n - 1)];
        p[static_cast<size_t>(radius_ + n)] =
            p[static_cast<size_t>(radius_ + n - 1)] + positive[static_cast<size_t>(n - 1)];
    }
}

int FGates::min_index() const { return -radius_; }
int FGates::max_index() const { return radius_; }
bool FGates::has_legacy_domain() const { return radius_ >= LEGACY_RADIUS; }

int64_t FGates::at(int gate) const {
    if (gate < min_index() || gate > max_index()) throw std::out_of_range("gate index");
    return p.at(static_cast<size_t>(gate + radius_));
}

int FGates::contain(int64_t day) const {
    if (day <= p.front() || day > p.back()) {
        throw std::runtime_error("day beyond bidirectional gate corpus");
    }
    const auto it = std::lower_bound(p.begin() + 1, p.end(), day);
    return min_index() + static_cast<int>(it - p.begin()) - 1;
}

bool FGates::in_legacy_day_domain(int64_t day) const {
    return has_legacy_domain() && day > at(-LEGACY_RADIUS) && day <= at(LEGACY_RADIUS);
}

struct FC {
    int o;
    int c;
    int64_t len;
};

FY fanchor(int64_t calc, const FGates& G, const FStones& S) {
    const int k = G.contain(calc);
    const bool legacy = G.in_legacy_day_domain(calc);
    const int anchorMin = legacy ? -FGates::LEGACY_RADIUS : G.min_index();
    const int anchorMax = legacy ? FGates::LEGACY_RADIUS : G.max_index();
    std::vector<FC> candidates;
    for (int o = k; o >= anchorMin && calc - G.at(o) <= 5778; --o) {
        for (int c = k + 1; c <= anchorMax && G.at(c) - calc <= 5778; ++c) {
            const int64_t len = G.at(c) - G.at(o);
            if (c - o >= 6 && len >= 252 && len <= 5778) {
                candidates.push_back({o, c, len});
            }
        }
    }
    if (candidates.empty()) throw std::runtime_error("no anchor candidates in gate corpus");
    std::sort(candidates.begin(), candidates.end(), [](const FC& a, const FC& b) {
        return a.len != b.len ? a.len < b.len : a.o < b.o;
    });
    const auto sauce = fast_sauce(calc, calc, S);
    const int ix = static_cast<int>(fast_choose_small(sauce, 1, 10, candidates.size())) - 1;
    const auto chosen = candidates.at(static_cast<size_t>(ix));
    return {5000, chosen.o, chosen.c, G.at(chosen.o), G.at(chosen.c)};
}

FY fadj(int64_t calc, const FGates& G, const FStones& S, const FY& y, bool next) {
    const int fixed = next ? y.c : y.o;
    const bool legacy = G.in_legacy_day_domain(calc);
    if (next) {
        const int first = fixed + 6;
        auto candidate_count = [&](int maxIndex, int& last) {
            last = first - 1;
            for (int c = first; c <= maxIndex; ++c) {
                if (G.at(c) - G.at(fixed) > 5778) break;
                last = c;
            }
            return last - first + 1;
        };
        int last = first - 1;
        int searchMax = (legacy && fixed < FGates::LEGACY_RADIUS)
            ? FGates::LEGACY_RADIUS : G.max_index();
        int n = first <= searchMax ? candidate_count(searchMax, last) : 0;
        if (n <= 0 && searchMax != G.max_index()) {
            searchMax = G.max_index();
            n = first <= searchMax ? candidate_count(searchMax, last) : 0;
        }
        if (n <= 0) throw std::runtime_error("no next year in gate corpus");
        const auto sauce = fast_sauce(calc, G.at(fixed), S);
        const int rank = static_cast<int>(fast_choose_small(sauce, 1, 11, n));
        const int c = first + rank - 1;
        return {y.num + 1, fixed, c, G.at(fixed), G.at(c)};
    }

    const int first = fixed - 6;
    auto candidate_count = [&](int minIndex, int& last) {
        last = first + 1;
        for (int o = first; o >= minIndex; --o) {
            if (G.at(fixed) - G.at(o) > 5778) break;
            last = o;
        }
        return first - last + 1;
    };
    int last = first + 1;
    int searchMin = (legacy && fixed > -FGates::LEGACY_RADIUS)
        ? -FGates::LEGACY_RADIUS : G.min_index();
    int n = first >= searchMin ? candidate_count(searchMin, last) : 0;
    if (n <= 0 && searchMin != G.min_index()) {
        searchMin = G.min_index();
        n = first >= searchMin ? candidate_count(searchMin, last) : 0;
    }
    if (n <= 0) throw std::runtime_error("no previous year in gate corpus");
    const auto sauce = fast_sauce(calc, G.at(fixed), S);
    const int rank = static_cast<int>(fast_choose_small(sauce, 1, 12, n));
    const int o = first - rank + 1;
    return {y.num - 1, o, fixed, G.at(o), G.at(fixed)};
}

} // namespace seer_native::detail
