#define main seer_embedded_canonical_vector_oracle_main
#include "canonical_vector_oracle.cpp"
#undef main

#include <cstring>

static Year edge_year_ref(int64_t calc, const Gates& gates, bool next, long long& steps) {
    Year y = anchor_year(calc, gates, true);
    steps = 0;
    for (;;) {
        try {
            y = adjacent_year(calc, gates, y, next, true);
            ++steps;
        } catch (const std::runtime_error& e) {
            const char* expected = next ? "no next year in corpus" : "no previous year in corpus";
            const char* alternate = next ? "no next year in corpus" : "no previous year";
            if (std::strcmp(e.what(), expected) != 0 && std::strcmp(e.what(), alternate) != 0) throw;
            return y;
        }
    }
}

int main(int argc, char** argv) {
    if (argc != 4) {
        std::cerr << "usage: full_domain_reference_probe <positive_gates> <negative_gates> <calc_jdn>\n";
        return 2;
    }
    try {
        const int64_t calc = std::stoll(argv[3]);
        Gates gates(argv[1], argv[2]);
        const Year anchor = anchor_year(calc, gates, true);
        long long prevSteps = 0, nextSteps = 0;
        const Year first = edge_year_ref(calc, gates, false, prevSteps);
        const Year last = edge_year_ref(calc, gates, true, nextSteps);
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
        std::cerr << "full_domain_reference_probe: " << e.what() << '\n';
        return 1;
    }
}
