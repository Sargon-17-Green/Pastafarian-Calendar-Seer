#ifndef SAUCE_HEADER
#define SAUCE_HEADER "sauce_fast127_v12.hpp"
#endif
#include SAUCE_HEADER
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 2 || argc > 3) return 2;
    const bool negative = argc == 3 && std::string(argv[2]) == "--negative";
    if (argc == 3 && !negative) return 2;

    std::ifstream f(argv[1], std::ios::binary);
    if (!f) return 3;
    f.seekg(0, std::ios::end);
    const size_t bytes = static_cast<size_t>(f.tellg());
    f.seekg(0);
    if (bytes != 80000) {
        std::cerr << "bad gate file size\n";
        return 3;
    }

    std::vector<uint16_t> g(40000);
    for (size_t i = 0; i < g.size(); ++i) {
        unsigned char b[2]{};
        f.read(reinterpret_cast<char*>(b), 2);
        if (!f) return 3;
        g[i] = static_cast<uint16_t>(b[0]) | (static_cast<uint16_t>(b[1]) << 8);
    }
    auto stones = fast_stones();
    constexpr int64_t F = -13334246LL;
    const int64_t direction = negative ? -1 : 1;
    int bad = 0, mn = 9999, mx = 0;
    uint64_t sum = 0;
    for (int n = 1; n <= 40000; ++n) {
        const int64_t target = F + direction * static_cast<int64_t>(n);
        const uint64_t x = fast_choose_small(fast_sauce(F, target, stones), 1, 1, 922) + 41;
        sum += x;
        mn = std::min(mn, static_cast<int>(x));
        mx = std::max(mx, static_cast<int>(x));
        if (x != g[static_cast<size_t>(n - 1)]) {
            if (bad < 5) {
                std::cerr << (negative ? "negative" : "positive")
                          << " mismatch n=" << n
                          << " got=" << x << " exp=" << g[static_cast<size_t>(n - 1)] << "\n";
            }
            ++bad;
        }
    }
    std::cout << "direction=" << (negative ? "negative" : "positive")
              << " bad=" << bad << " min=" << mn << " max=" << mx << " sum=" << sum << "\n";
    return bad ? 1 : 0;
}
