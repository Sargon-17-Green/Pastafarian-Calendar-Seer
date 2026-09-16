#define main seer_embedded_rns_micro8_main
#include "../src/rns_micro8_avx2_32x8.cpp"
#undef main

#include <map>

struct EdgeCase {
    std::string name;
    mpz_class rank;
};

int main(int argc, char** argv) {
    try {
        const int threads = argc > 1 ? std::max(1, atoi(argv[1])) : 3;
        std::vector<int> lengths(47, 123);
        lengths.back() = 120; // canonical maximum year length: 5,778 days

        ExactTable exact(lengths);
        ApproxTable approx(lengths);
        RnsEngine engine(lengths, 1008, threads);
        if (!validate_count(engine, exact)) throw std::runtime_error("RNS count validation failed");

        const mpz_class N = engine.crt(engine.Nres, engine.npr);
        const int initialBasis = engine.basis_for(N, engine.npr);
        const auto coeff = init_coeff(engine, initialBasis);
        if (!validate_frac(engine, initialBasis, coeff)) throw std::runtime_error("fraction validation failed");

        std::vector<EdgeCase> cases = {
            {"first", 1},
            {"second", 2},
            {"third", 3},
            {"middle", N / 2},
            {"third-last", N - 2},
            {"second-last", N - 1},
            {"last", N},
        };

        ReplayPool pool(engine, threads);
        std::cout << "case,ok,splits,fallback,failed,invalid,forced,cert,micro,unknown_ms\n";
        for (const auto& test : cases) {
            const auto gold = gold_word(exact, test.rank);
            FastState state;
            state.st = initial_struct(lengths);
            state.pack = engine.initPacks;
            state.k = initialBasis;
            state.coeff = coeff;
            state.rank = test.rank;
            state.total = N;
            set_rank_resid(engine, state);

            Unknown unranker{engine, approx, exact, gold, pool, 512};
            const bool ok = unranker.run(state);
            const auto& stats = unranker.st;
            std::cout << test.name << ',' << ok << ',' << stats.splits << ',' << stats.fallback
                      << ',' << stats.failed << ',' << stats.invalid << ',' << stats.forced
                      << ',' << stats.cert << ',' << stats.micro << ',' << std::fixed
                      << std::setprecision(6) << stats.total_ms << '\n';
            if (!ok) throw std::runtime_error("edge-rank exact mismatch: " + test.name);
            if (unranker.out != gold) throw std::runtime_error("edge-rank output mismatch: " + test.name);
        }

        std::cout << "Weave edge-rank exact validation: PASS\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "weave_edge_rank_probe: " << e.what() << '\n';
        return 1;
    }
}
