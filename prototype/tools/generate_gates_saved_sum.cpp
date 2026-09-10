#include "canonical_saved_sum_reference.hpp"
#include <boost/multiprecision/cpp_int.hpp>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
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
    if (argc < 2 || argc > 3) {
        std::cerr << "usage: generate_gates_saved_sum OUTPUT [--raw-mutant]\n";
        return 2;
    }
    const bool savedSum = !(argc == 3 && std::string(argv[2]) == "--raw-mutant");
    if (argc == 3 && savedSum) {
        std::cerr << "unknown option\n";
        return 2;
    }

    std::ofstream out(argv[1], std::ios::binary | std::ios::trunc);
    if (!out) {
        std::cerr << "cannot open output\n";
        return 3;
    }

    constexpr int64_t F = reference::FOUNDATION;
    std::vector<uint16_t> gaps(40000);
    // Warm the immutable stone table before entering the parallel region.
    (void)reference::sauce(F, F + 1, savedSum);
    #pragma omp parallel for schedule(static)
    for (int i = 1; i <= 40000; ++i) {
        const auto sauce = reference::sauce(F, F + i, savedSum);
        const uint64_t gap = choose_small(sauce, 1, 1, 922) + 41;
        gaps[static_cast<size_t>(i - 1)] = static_cast<uint16_t>(gap);
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
              << " count=40000 min=" << mn << " max=" << mx << " sum=" << sum << "\n";
}
