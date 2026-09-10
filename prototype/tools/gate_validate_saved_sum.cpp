#ifndef SAUCE_HEADER
#define SAUCE_HEADER "sauce_fast127_v12.hpp"
#endif
#include SAUCE_HEADER
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <vector>

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    std::ifstream f(argv[1], std::ios::binary);
    if (!f) return 3;
    std::vector<uint16_t> g(40000);
    f.read(reinterpret_cast<char*>(g.data()), static_cast<std::streamsize>(g.size() * 2));
    if (f.gcount() != 80000) {
        std::cerr << "bad gate file\n";
        return 3;
    }
    auto stones = fast_stones();
    constexpr int64_t F = -13334246LL;
    int bad = 0, mn = 9999, mx = 0;
    uint64_t sum = 0;
    for (int i = 1; i <= 40000; ++i) {
        const uint64_t x = fast_choose_small(fast_sauce(F, F + i, stones), 1, 1, 922) + 41;
        sum += x;
        mn = std::min(mn, static_cast<int>(x));
        mx = std::max(mx, static_cast<int>(x));
        if (x != g[static_cast<size_t>(i - 1)]) {
            if (bad < 5) std::cerr << "mismatch i=" << i << " got=" << x << " exp=" << g[static_cast<size_t>(i - 1)] << "\n";
            ++bad;
        }
    }
    std::cout << "bad=" << bad << " min=" << mn << " max=" << mx << " sum=" << sum << "\n";
    return bad ? 1 : 0;
}
