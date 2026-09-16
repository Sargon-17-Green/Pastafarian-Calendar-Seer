#define main seer_embedded_year_fast_bench_v12_main
#include "../src/year_fast_bench_v12.cpp"
#undef main

#include <cstring>

static FY edge_year(int64_t calc, const FGates& gates, const FStones& stones, bool next, long long& steps) {
    FY y = fanchor(calc, gates, stones);
    steps = 0;
    for (;;) {
        try {
            y = fadj(calc, gates, stones, y, next);
            ++steps;
        } catch (const std::runtime_error& e) {
            const char* expected = next ? "no next year in gate corpus" : "no previous year in gate corpus";
            if (std::strcmp(e.what(), expected) != 0) throw;
            return y;
        }
    }
}

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: full_domain_fast_probe <calc_jdn>\n";
        return 2;
    }
    try {
        const int64_t calc = std::stoll(argv[1]);
        FGates gates("gates_u16.bin");
        const auto stones = fast_stones();
        const FY anchor = fanchor(calc, gates, stones);
        long long prevSteps = 0, nextSteps = 0;
        const FY first = edge_year(calc, gates, stones, false, prevSteps);
        const FY last = edge_year(calc, gates, stones, true, nextSteps);
        std::cout << "calc=" << calc
                  << " min_gate=" << gates.min_index() << " max_gate=" << gates.max_index()
                  << " anchor_year=" << anchor.num << " anchor_open=" << anchor.o << " anchor_close=" << anchor.c
                  << " anchor_a=" << anchor.a << " anchor_b=" << anchor.b
                  << " first_year=" << first.num << " first_open=" << first.o << " first_close=" << first.c
                  << " first_a=" << first.a << " first_b=" << first.b << " prev_steps=" << prevSteps
                  << " last_year=" << last.num << " last_open=" << last.o << " last_close=" << last.c
                  << " last_a=" << last.a << " last_b=" << last.b << " next_steps=" << nextSteps << '\n';
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "full_domain_fast_probe: " << e.what() << '\n';
        return 1;
    }
}
