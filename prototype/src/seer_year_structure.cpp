#define main seer_year_batch_embedded_main
#include "pastafarian_year_batch.cpp"
#undef main

#include <iostream>
#include <fstream>
#include <cstdlib>

static std::vector<BatchRecord> ys_compute_days(
    int64_t calc, const FGates& G, const FY& y, const FSauce& structSauce,
    const YBStructResult& st, int threads, int sb, int replayThreads) {
    const int yearLen = (int)(y.b - y.a);
    if (const char* counter = std::getenv("SEER_TEST_WEAVE_COUNTER_FILE")) {
        std::ofstream out(counter, std::ios::app);
        out << "weave\n";
    }
    int npr = yb_conservative_npr(st.monthLen);
    RnsEngine eng(st.monthLen, npr, threads);
    mpz_class N = eng.crt(eng.Nres, eng.npr);
    int initk = eng.basis_for(N, eng.npr);
    auto coeff = init_coeff(eng, initk);
    int width = 0;
    mpz_class rank = yb_fast_choose_mpz(structSauce, 4, 32, N, &width);
    ExactTable gtDummy(std::vector<int>{1});
    std::vector<int> dummyGold(yearLen, -1); dummyGold[0] = 0;
    ApproxTable ap(st.monthLen);
    ReplayPool pool(eng, replayThreads);
    FastState fs;
    fs.st = initial_struct(st.monthLen); fs.pack = eng.initPacks; fs.k = initk;
    fs.coeff = coeff; fs.rank = rank; fs.total = N; set_rank_resid(eng, fs);
    Unknown u{eng, ap, gtDummy, dummyGold, pool, sb};
    u.run(fs, yearLen);
    if ((int)u.out.size() < yearLen) throw std::runtime_error("weave shorter than full year");

    std::vector<int> seen(st.monthCount, 0);
    std::vector<BatchRecord> out; out.reserve((size_t)yearLen);
    for (int offset = 0; offset < yearLen; ++offset) {
        int mi = u.out[offset];
        if (mi < 0 || mi >= st.monthCount) throw std::runtime_error("invalid month index from weave");
        int dim = ++seen[mi];
        int ci = -1;
        for (int i = 0; i < st.cutletCount; ++i) {
            if (offset >= st.cutStart[i] && offset <= st.cutEnd[i]) { ci = i; break; }
        }
        if (ci < 0) throw std::runtime_error("cutlet lost");
        BatchRecord r;
        r.targetJdn = y.a + 1 + offset; r.year = (long long)y.num;
        r.cutletIndex = st.cutName[ci]; r.dayInCutlet = offset - st.cutStart[ci] + 1;
        r.monthIndex = st.monthName[mi]; r.dayInMonth = dim;
        r.cutletCount = st.cutletCount; r.monthCount = st.monthCount;
        out.push_back(r);
    }
    return out;
}

int main(int argc, char** argv) {
    try {
        if (argc < 4) {
            std::cerr << "usage: seer_year_structure <calc_jdn> <year> <include_days:0|1> [threads] [superblock] [replay_threads]\n";
            return 2;
        }
        const int64_t calc = std::stoll(argv[1]);
        const long long requested = std::stoll(argv[2]);
        const int includeDays = std::stoi(argv[3]);
        if (includeDays != 0 && includeDays != 1) throw std::runtime_error("include_days must be 0 or 1");
        const int threads = argc > 4 ? atoi(argv[4]) : 3;
        const int sb = argc > 5 ? atoi(argv[5]) : 512;
        const int replayThreads = argc > 6 ? atoi(argv[6]) : threads;
        if (threads < 1 || replayThreads < 1 || sb < 1) throw std::runtime_error("invalid execution parameters");

        FGates G("gates_u16.bin");
        auto S = fast_stones();
        FY y = fanchor(calc, G, S);
        while (y.num < requested) y = fadj(calc, G, S, y, true);
        while (y.num > requested) y = fadj(calc, G, S, y, false);
        const int64_t start = y.a + 1, end = y.b, length = y.b - y.a;
        if (length < 1 || length > 10000) throw std::runtime_error("located year length is outside supported limit");

        FSauce structSauce = fast_sauce(calc, start, S);
        YBStructResult st = yb_build_nonweave(calc, G, y, structSauce);
        std::vector<BatchRecord> days;
        if (includeDays) days = ys_compute_days(calc, G, y, structSauce, st, threads, sb, replayThreads);

        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-year-structure\",\"calcJdn\":" << calc
                  << ",\"year\":" << y.num << ",\"startJdn\":" << start << ",\"endJdn\":" << end
                  << ",\"lengthDays\":" << length << ",\"cutlets\":[";
        for (int i = 0; i < st.cutletCount; ++i) {
            if (i) std::cout << ',';
            std::cout << "{\"cutletIndex\":" << st.cutName[i]
                      << ",\"startOffset\":" << st.cutStart[i]
                      << ",\"endOffset\":" << st.cutEnd[i]
                      << ",\"lengthDays\":" << (st.cutEnd[i] - st.cutStart[i] + 1) << '}';
        }
        std::cout << "],\"months\":[";
        for (int i = 0; i < st.monthCount; ++i) {
            if (i) std::cout << ',';
            std::cout << "{\"monthIndex\":" << st.monthName[i] << ",\"lengthDays\":" << st.monthLen[i] << '}';
        }
        std::cout << ']';
        if (includeDays) {
            std::cout << ",\"days\":[";
            for (size_t i = 0; i < days.size(); ++i) {
                if (i) std::cout << ',';
                const auto& r = days[i];
                std::cout << "{\"targetJdn\":" << r.targetJdn << ",\"year\":" << r.year
                          << ",\"cutletIndex\":" << r.cutletIndex << ",\"dayInCutlet\":" << r.dayInCutlet
                          << ",\"monthIndex\":" << r.monthIndex << ",\"dayInMonth\":" << r.dayInMonth
                          << ",\"cutletCount\":" << r.cutletCount << ",\"monthCount\":" << r.monthCount << '}';
            }
            std::cout << ']';
        }
        std::cout << "}\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "seer_year_structure: " << e.what() << "\n";
        return 1;
    }
}
