#define main opt07_embedded_year_fast_main
#include "year_fast_bench_v12.cpp"
#undef main

#include <chrono>
#include <cstdint>
#include <iostream>
#include <map>
#include <random>
#include <unordered_map>
#include <vector>

struct Opt07Edge {
    int from = 0;
    int to = 0;
    int64_t weight = 0;
};

static Opt07Edge opt07_next_edge(
    int64_t calc, int gate, const FGates& G, const FStones& S) {
    if (gate < G.min_index() || gate > G.max_index()) throw std::runtime_error("gate index out of range");
    FY dummy{0, std::max(G.min_index(), gate - 6), gate,
             G.at(std::max(G.min_index(), gate - 6)), G.at(gate)};
    FY next = fadj(calc, G, S, dummy, true);
    if (next.o != gate) throw std::runtime_error("NEXT did not preserve fixed opening gate");
    if (next.c <= gate) throw std::runtime_error("NEXT is not strictly increasing");
    return {gate, next.c, next.b - next.a};
}

static uint64_t opt07_mix(uint64_t x) {
    x ^= x >> 30; x *= 0xbf58476d1ce4e5b9ULL;
    x ^= x >> 27; x *= 0x94d049bb133111ebULL;
    x ^= x >> 31; return x;
}

int main(int argc, char** argv) {
    try {
        if (argc < 2) {
            std::cerr << "usage: opt07_transition_research <calc_jdn> [sample_radius] [bench_queries]\n";
            return 2;
        }
        const int64_t calc = std::stoll(argv[1]);
        const int radius = argc > 2 ? std::max(32, std::min(2048, std::stoi(argv[2]))) : 384;
        const int benchQueries = argc > 3 ? std::max(10000, std::min(5000000, std::stoi(argv[3]))) : 500000;

        FGates G("gates_u16.bin");
        auto S = fast_stones();
        const FY anchor = fanchor(calc, G, S);

        // Materialize the same single canonical path OPT-06 owns for this c.
        std::vector<FY> path;
        path.reserve(1024);
        path.push_back(anchor);
        for (int i = 0; i < 768; ++i) {
            try {
                FY n = fadj(calc, G, S, path.back(), true);
                if (n.o != path.back().c || n.num != path.back().num + 1 || n.a != path.back().b) {
                    throw std::runtime_error("canonical NEXT chain discontinuity");
                }
                path.push_back(n);
            } catch (const std::exception&) {
                break;
            }
        }
        if (path.size() < 8) throw std::runtime_error("insufficient forward path for OPT-07 research");

        size_t compositionChecks = 0;
        for (size_t i = 0; i + 2 < path.size(); ++i) {
            const Opt07Edge a = opt07_next_edge(calc, path[i].c, G, S);
            const Opt07Edge b = opt07_next_edge(calc, a.to, G, S);
            if (a.to != path[i + 1].c || b.to != path[i + 2].c) {
                throw std::runtime_error("T composition endpoint mismatch");
            }
            const int64_t composedWeight = a.weight + b.weight;
            const int64_t canonicalWeight = path[i + 2].b - path[i].b;
            if (composedWeight != canonicalWeight) {
                throw std::runtime_error("W composition mismatch");
            }
            ++compositionChecks;
        }

        const int lo = std::max(G.min_index(), anchor.c - radius);
        const int hi = std::min(G.max_index(), anchor.c + radius);
        std::unordered_map<int, int> indegree1;
        std::unordered_map<int, int> indegree2;
        size_t sampledEdges = 0;
        size_t composedEdges = 0;
        int observedMinJump = std::numeric_limits<int>::max();
        int observedMaxJump = 0;
        for (int e = lo; e <= hi; ++e) {
            try {
                const auto a = opt07_next_edge(calc, e, G, S);
                ++sampledEdges;
                ++indegree1[a.to];
                observedMinJump = std::min(observedMinJump, a.to - e);
                observedMaxJump = std::max(observedMaxJump, a.to - e);
                try {
                    const auto b = opt07_next_edge(calc, a.to, G, S);
                    ++composedEdges;
                    ++indegree2[b.to];
                    if (a.weight <= 0 || b.weight <= 0) throw std::runtime_error("non-positive transition weight");
                } catch (const std::exception&) {}
            } catch (const std::exception&) {}
        }
        size_t mergeTargets1 = 0, mergeSources1 = 0, mergeTargets2 = 0, mergeSources2 = 0;
        for (const auto& [_, n] : indegree1) if (n > 1) { ++mergeTargets1; mergeSources1 += (size_t)n; }
        for (const auto& [_, n] : indegree2) if (n > 1) { ++mergeTargets2; mergeSources2 += (size_t)n; }

        const size_t n = path.size();
        size_t levels = 1;
        while ((size_t(1) << levels) < n) ++levels;
        std::vector<std::vector<uint32_t>> up(levels, std::vector<uint32_t>(n));
        std::vector<std::vector<int64_t>> weight(levels, std::vector<int64_t>(n, 0));
        for (size_t i = 0; i < n; ++i) {
            up[0][i] = (uint32_t)std::min(i + 1, n - 1);
            weight[0][i] = i + 1 < n ? path[i + 1].b - path[i].b : 0;
        }
        for (size_t k = 1; k < levels; ++k) {
            for (size_t i = 0; i < n; ++i) {
                const uint32_t mid = up[k - 1][i];
                up[k][i] = up[k - 1][mid];
                weight[k][i] = weight[k - 1][i] + weight[k - 1][mid];
            }
        }

        for (size_t distance = 0; distance < n; ++distance) {
            size_t pos = 0;
            int64_t sum = 0;
            size_t d = distance, bit = 0;
            while (d) {
                if (d & 1) {
                    sum += weight[bit][pos];
                    pos = up[bit][pos];
                }
                d >>= 1;
                ++bit;
            }
            if (pos != distance) throw std::runtime_error("binary lift endpoint mismatch");
            if (sum != path[distance].b - path[0].b) throw std::runtime_error("binary lift weight mismatch");
        }
        volatile uint64_t sink = 0;
        auto t0 = std::chrono::steady_clock::now();
        for (int q = 0; q < benchQueries; ++q) {
            const size_t distance = (size_t)(opt07_mix((uint64_t)q) % n);
            sink ^= (uint64_t)path[distance].c;
        }
        auto t1 = std::chrono::steady_clock::now();
        for (int q = 0; q < benchQueries; ++q) {
            size_t d = (size_t)(opt07_mix((uint64_t)q) % n);
            size_t pos = 0, bit = 0;
            while (d) {
                if (d & 1) pos = up[bit][pos];
                d >>= 1;
                ++bit;
            }
            sink ^= (uint64_t)path[pos].c;
        }
        auto t2 = std::chrono::steady_clock::now();

        const double directNs =
            std::chrono::duration<double, std::nano>(t1 - t0).count() / benchQueries;
        const double liftNs =
            std::chrono::duration<double, std::nano>(t2 - t1).count() / benchQueries;
        const size_t liftCells = levels * n;
        const size_t chainCells = n;
        const char* decision = "DO_NOT_ADOPT";

        std::cout
            << "schema=1\n"
            << "calc=" << calc << "\n"
            << "anchor_year=" << anchor.num << "\n"
            << "canonical_states=" << n << "\n"
            << "composition_checks=" << compositionChecks << "\n"
            << "composition=PASS\n"
            << "sampled_edges=" << sampledEdges << "\n"
            << "composed_edges=" << composedEdges << "\n"
            << "observed_gate_jump_min=" << (sampledEdges ? observedMinJump : 0) << "\n"
            << "observed_gate_jump_max=" << observedMaxJump << "\n"
            << "one_step_merge_targets=" << mergeTargets1 << "\n"
            << "one_step_merge_sources=" << mergeSources1 << "\n"
            << "two_step_merge_targets=" << mergeTargets2 << "\n"
            << "two_step_merge_sources=" << mergeSources2 << "\n"
            << "lift_levels=" << levels << "\n"
            << "chain_cells=" << chainCells << "\n"
            << "lift_cells=" << liftCells << "\n"
            << "cold_transition_calls_chain=" << (n - 1) << "\n"
            << "cold_transition_calls_lift_min=" << (n - 1) << "\n"
            << "cached_by_year_chain_complexity=O(1)\n"
            << "cached_by_year_lift_complexity=O(log_n)\n"
            << "cached_by_target_chain_complexity=O(log_n)\n"
            << "cached_by_target_lift_complexity=O(log_n)\n"
            << "direct_lookup_ns=" << directNs << "\n"
            << "lift_lookup_ns=" << liftNs << "\n"
            << "sink=" << sink << "\n"
            << "decision=" << decision << "\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "opt07_transition_research: " << e.what() << "\n";
        return 1;
    }
}
