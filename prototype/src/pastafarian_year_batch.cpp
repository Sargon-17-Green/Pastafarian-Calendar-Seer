#include "seer_calendar_core.hpp"

#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>

using seer_native::BatchRecord;
using seer_native::ExecutionParams;
using seer_native::detail::FGates;
using seer_native::detail::FY;
using seer_native::detail::compute_segment;
using seer_native::detail::fadj;
using seer_native::detail::fanchor;

int main(int argc, char** argv) {
    try {
        if (argc < 4) {
            std::cerr << "usage: seer_year_batch <calc_jdn> <target_start_jdn> <count> [threads] [superblock] [replay_threads]\n";
            return 2;
        }
        const int64_t calc = std::stoll(argv[1]);
        const int64_t targetStart = std::stoll(argv[2]);
        const long long count = std::stoll(argv[3]);
        if (count <= 0 || count > 10000) throw std::runtime_error("count must be in 1..10000");
        ExecutionParams params;
        params.threads = argc > 4 ? atoi(argv[4]) : 3;
        params.superblock = argc > 5 ? atoi(argv[5]) : 512;
        params.replayThreads = argc > 6 ? atoi(argv[6]) : params.threads;
        if (params.threads < 1 || params.replayThreads < 1 || params.superblock < 1) {
            throw std::runtime_error("invalid execution parameters");
        }

        const int64_t delta = static_cast<int64_t>(count) - 1;
        if (targetStart > std::numeric_limits<int64_t>::max() - delta) {
            throw std::overflow_error("target range overflow");
        }
        const int64_t targetEnd = targetStart + delta;

        FGates gates("gates_100k_u16.bin", "gates_negative_100k_u16.bin");
        const auto stones = fast_stones();
        FY year = fanchor(calc, gates, stones);
        while (targetStart < year.a + 1) year = fadj(calc, gates, stones, year, false);
        while (targetStart > year.b) year = fadj(calc, gates, stones, year, true);

        std::vector<BatchRecord> records;
        records.reserve(static_cast<size_t>(count));
        int64_t cursor = targetStart;
        while (cursor <= targetEnd) {
            const int64_t segmentEnd = std::min<int64_t>(targetEnd, year.b);
            auto part = compute_segment(calc, cursor, segmentEnd, gates, stones, year, params);
            records.insert(records.end(), part.begin(), part.end());
            if (segmentEnd == targetEnd) break;
            cursor = segmentEnd + 1;
            year = fadj(calc, gates, stones, year, true);
        }
        if (records.size() != static_cast<size_t>(count)) {
            throw std::runtime_error("batch record count mismatch");
        }

        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-avx2-batch\",\"calcJdn\":" << calc
                  << ",\"targetStartJdn\":" << targetStart
                  << ",\"targetCount\":" << count << ",\"records\":[";
        for (size_t i = 0; i < records.size(); ++i) {
            if (i) std::cout << ',';
            const auto& r = records[i];
            std::cout << "{\"targetJdn\":" << r.targetJdn
                      << ",\"year\":" << r.year
                      << ",\"cutletIndex\":" << r.cutletIndex
                      << ",\"dayInCutlet\":" << r.dayInCutlet
                      << ",\"monthIndex\":" << r.monthIndex
                      << ",\"dayInMonth\":" << r.dayInMonth
                      << ",\"cutletCount\":" << r.cutletCount
                      << ",\"monthCount\":" << r.monthCount << '}';
        }
        std::cout << "]}\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "seer_year_batch: " << e.what() << "\n";
        return 1;
    }
}
