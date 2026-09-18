#include "canonical_saved_sum_reference.hpp"
#include <boost/multiprecision/cpp_int.hpp>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

using boost::multiprecision::cpp_int;

static uint64_t choose_small(const reference::Trace& sauce, int bowl, uint64_t seal, uint64_t n) {
    if (n == 0) throw std::runtime_error("ways count must be positive");
    auto d = reference::desc(sauce, bowl, seal);
    cpp_int c = reference::rep(d.first);
    const cpp_int limit = (reference::M / n) * n;
    while (c > limit) {
        if (d.second) c = (c == reference::M) ? cpp_int(1) : c + 1;
        else c = (c == 1) ? reference::M : c - 1;
    }
    return ((c - 1) % n).convert_to<uint64_t>() + 1;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "usage: generate_gates_saved_sum OUTPUT [--negative] [--raw-mutant] [--count N]\n";
        return 2;
    }
    bool negative = false;
    bool savedSum = true;
    int count = 40000;
    for (int i = 2; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--negative") {
            if (negative) { std::cerr << "duplicate --negative\n"; return 2; }
            negative = true;
        } else if (arg == "--raw-mutant") {
            if (!savedSum) { std::cerr << "duplicate --raw-mutant\n"; return 2; }
            savedSum = false;
        } else if (arg == "--count") {
            if (++i >= argc) { std::cerr << "--count requires a value\n"; return 2; }
            try {
                const long long parsed = std::stoll(argv[i]);
                if (parsed < 1 || parsed > std::numeric_limits<int>::max()) throw std::out_of_range("count");
                count = static_cast<int>(parsed);
            } catch (...) {
                std::cerr << "invalid --count value\n";
                return 2;
            }
        } else {
            std::cerr << "unknown option: " << arg << "\n";
            return 2;
        }
    }

    constexpr int64_t F = reference::FOUNDATION;
    const int64_t direction = negative ? -1 : 1;
    std::vector<uint16_t> gaps(static_cast<size_t>(count));

    // Warm immutable reference tables before the OpenMP region.
    (void)reference::sauce(F, F + direction, savedSum);
    #pragma omp parallel for schedule(static)
    for (int n = 1; n <= count; ++n) {
        const int64_t target = F + direction * static_cast<int64_t>(n);
        const auto sauce = reference::sauce(F, target, savedSum);
        const uint64_t gap = choose_small(sauce, 1, 1, 922) + 41;
        gaps[static_cast<size_t>(n - 1)] = static_cast<uint16_t>(gap);
    }
    std::ofstream out(argv[1], std::ios::binary | std::ios::trunc);
    if (!out) {
        std::cerr << "cannot open output\n";
        return 3;
    }

    uint64_t sum = 0;
    uint16_t mn = std::numeric_limits<uint16_t>::max(), mx = 0;
    for (uint16_t x : gaps) {
        const unsigned char bytes[2] = {
            static_cast<unsigned char>(x & 0xff),
            static_cast<unsigned char>(x >> 8)
        };
        out.write(reinterpret_cast<const char*>(bytes), 2);
        if (!out) {
            std::cerr << "write failure\n";
            return 5;
        }
        sum += x;
        if (x < mn) mn = x;
        if (x > mx) mx = x;
    }

    std::cout << "mode=" << (savedSum ? "saved-sum" : "raw-mutant")
              << " direction=" << (negative ? "negative" : "positive")
              << " count=" << gaps.size()
              << " min=" << mn << " max=" << mx << " sum=" << sum << "\n";
    return 0;
}
