#define main seer_year_fast_embedded_main
#include "year_fast_bench_v12.cpp"
#undef main

#include <iostream>

int main(int argc, char** argv) {
    try {
        if (argc != 3) {
            std::cerr << "usage: seer_year_locator <calc_jdn> <year>\n";
            return 2;
        }
        const int64_t calc = std::stoll(argv[1]);
        const long long requested = std::stoll(argv[2]);
        FGates G("gates_u16.bin");
        auto S = fast_stones();
        FY y = fanchor(calc, G, S);
        while (y.num < requested) y = fadj(calc, G, S, y, true);
        while (y.num > requested) y = fadj(calc, G, S, y, false);
        const int64_t start = y.a + 1;
        const int64_t end = y.b;
        const int64_t length = y.b - y.a;
        if (length < 1 || length > 10000) throw std::runtime_error("located year length is outside batch-engine limit");
        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-year-locator\",\"calcJdn\":" << calc
                  << ",\"year\":" << y.num
                  << ",\"startJdn\":" << start
                  << ",\"endJdn\":" << end
                  << ",\"lengthDays\":" << length << "}\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "seer_year_locator: " << e.what() << "\n";
        return 1;
    }
}
