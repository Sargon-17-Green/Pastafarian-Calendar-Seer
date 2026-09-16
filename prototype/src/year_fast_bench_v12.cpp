#include "sauce_fast127_v12.hpp"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

struct FGates {
    static constexpr int RADIUS = 40000;
    static constexpr int64_t FOUNDATION_JDN = -13334246LL;
    std::vector<int64_t> p;

    static std::vector<uint16_t> load_gaps(const char* filename) {
        std::ifstream f(filename, std::ios::binary);
        if (!f) throw std::runtime_error(std::string("cannot open gate data: ") + filename);
        f.seekg(0, std::ios::end);
        const size_t bytes = static_cast<size_t>(f.tellg());
        f.seekg(0);
        if (bytes != static_cast<size_t>(RADIUS) * 2) {
            throw std::runtime_error(std::string("bad gate data size: ") + filename);
        }
        std::vector<uint16_t> out(RADIUS);
        for (int i = 0; i < RADIUS; ++i) {
            unsigned char b[2]{};
            f.read(reinterpret_cast<char*>(b), 2);
            if (!f) throw std::runtime_error(std::string("short gate data: ") + filename);
            out[static_cast<size_t>(i)] = static_cast<uint16_t>(b[0]) |
                (static_cast<uint16_t>(b[1]) << 8);
        }
        return out;
    }
    explicit FGates(
        const char* positiveFilename,
        const char* negativeFilename = "gates_negative_u16.bin") {
        const auto positive = load_gaps(positiveFilename);
        const auto negative = load_gaps(negativeFilename);
        p.resize(static_cast<size_t>(2 * RADIUS + 1));
        p[static_cast<size_t>(RADIUS)] = FOUNDATION_JDN;
        for (int n = 1; n <= RADIUS; ++n) {
            p[static_cast<size_t>(RADIUS - n)] =
                p[static_cast<size_t>(RADIUS - n + 1)] - negative[static_cast<size_t>(n - 1)];
            p[static_cast<size_t>(RADIUS + n)] =
                p[static_cast<size_t>(RADIUS + n - 1)] + positive[static_cast<size_t>(n - 1)];
        }
    }

    int min_index() const { return -RADIUS; }
    int max_index() const { return RADIUS; }

    int64_t at(int gate) const {
        if (gate < min_index() || gate > max_index()) throw std::out_of_range("gate index");
        return p.at(static_cast<size_t>(gate + RADIUS));
    }

    int contain(int64_t day) const {
        if (day <= p.front() || day > p.back()) {
            throw std::runtime_error("day beyond bidirectional gate corpus");
        }
        const auto it = std::lower_bound(p.begin() + 1, p.end(), day);
        return min_index() + static_cast<int>(it - p.begin()) - 1;
    }
};

struct FY { long long num; int o, c; int64_t a, b; };
struct FC { int o, c; int64_t len; };
static FY fanchor(int64_t calc, const FGates& G, const FStones& S) {
    const int k = G.contain(calc);
    std::vector<FC> candidates;
    for (int o = k; o >= G.min_index() && calc - G.at(o) <= 5778; --o) {
        for (int c = k + 1; c <= G.max_index() && G.at(c) - calc <= 5778; ++c) {
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

static FY fadj(int64_t calc, const FGates& G, const FStones& S, const FY& y, bool next) {
    const int fixed = next ? y.c : y.o;
    if (next) {
        const int first = fixed + 6;
        int last = first - 1;
        for (int c = first; c <= G.max_index(); ++c) {
            if (G.at(c) - G.at(fixed) > 5778) break;
            last = c;
        }
        const int n = last - first + 1;
        if (n <= 0) throw std::runtime_error("no next year in gate corpus");
        const auto sauce = fast_sauce(calc, G.at(fixed), S);
        const int rank = static_cast<int>(fast_choose_small(sauce, 1, 11, n));
        const int c = first + rank - 1;
        return {y.num + 1, fixed, c, G.at(fixed), G.at(c)};
    }

    const int first = fixed - 6;
    if (first < G.min_index()) throw std::runtime_error("no previous year in gate corpus");
    int last = first + 1;
    for (int o = first; o >= G.min_index(); --o) {
        if (G.at(fixed) - G.at(o) > 5778) break;
        last = o;
    }
    const int n = first - last + 1;
    if (n <= 0) throw std::runtime_error("no previous year in gate corpus");
    const auto sauce = fast_sauce(calc, G.at(fixed), S);
    const int rank = static_cast<int>(fast_choose_small(sauce, 1, 12, n));
    const int o = first - rank + 1;
    return {y.num - 1, o, fixed, G.at(o), G.at(fixed)};
}

int main(int argc, char** argv) {
    if (argc < 3) return 2;
    const int64_t calc = std::stoll(argv[1]);
    const int64_t target = std::stoll(argv[2]);
    const int reps = argc > 3 ? atoi(argv[3]) : 1;
    FGates G("gates_u16.bin");
    auto S = fast_stones();
    for (int r = 0; r < reps; ++r) {
        const auto t0 = std::chrono::steady_clock::now();
        auto y = fanchor(calc, G, S);
        const auto t1 = std::chrono::steady_clock::now();
        int steps = 0;
        while (target < y.a + 1) {
            y = fadj(calc, G, S, y, false);
            ++steps;
        }
        while (target > y.b) {
            y = fadj(calc, G, S, y, true);
            ++steps;
        }
        const auto t2 = std::chrono::steady_clock::now();
        std::cout << "anchor_ms=" << std::chrono::duration<double, std::milli>(t1 - t0).count()
                  << " walk_ms=" << std::chrono::duration<double, std::milli>(t2 - t1).count()
                  << " steps=" << steps
                  << " year=" << y.num
                  << " open=" << y.o
                  << " close=" << y.c
                  << " a=" << y.a
                  << " b=" << y.b << "\n";
    }
    return 0;
}
