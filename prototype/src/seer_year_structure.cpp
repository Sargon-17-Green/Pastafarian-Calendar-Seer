#include "seer_calendar_core.hpp"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <vector>

using seer_native::BatchRecord;
using seer_native::ExecutionParams;
using seer_native::detail::FGates;
using seer_native::detail::FY;
using seer_native::detail::YBStructResult;
using seer_native::detail::build_nonweave;
using seer_native::detail::compute_full_year_days;
using seer_native::detail::fadj;
using seer_native::detail::fanchor;

#ifndef SEER_YEAR_STRUCTURE_NO_MAIN
int main(int argc, char** argv) {
    try {
        if (argc < 4) {
            std::cerr << "usage: seer_year_structure <calc_jdn> <year> <include_days:0|1> [threads] [superblock] [replay_threads]\n";
            return 2;
        }
        const int64_t calc = std::stoll(argv[1]);
        const long long requested = std::stoll(argv[2]);
        const int includeDays = std::stoi(argv[3]);
        if (includeDays != 0 && includeDays != 1) {
            throw std::runtime_error("include_days must be 0 or 1");
        }
        ExecutionParams params;
        params.threads = argc > 4 ? atoi(argv[4]) : 3;
        params.superblock = argc > 5 ? atoi(argv[5]) : 512;
        params.replayThreads = argc > 6 ? atoi(argv[6]) : params.threads;
        if (params.threads < 1 || params.replayThreads < 1 || params.superblock < 1) {
            throw std::runtime_error("invalid execution parameters");
        }

        FGates gates("gates_100k_u16.bin", "gates_negative_100k_u16.bin");
        const auto stones = fast_stones();
        FY year = fanchor(calc, gates, stones);
        while (year.num < requested) year = fadj(calc, gates, stones, year, true);
        while (year.num > requested) year = fadj(calc, gates, stones, year, false);
        const int64_t start = year.a + 1;
        const int64_t end = year.b;
        const int64_t length = year.b - year.a;
        if (length < 1 || length > 10000) {
            throw std::runtime_error("located year length is outside supported limit");
        }

        const FSauce structSauce = fast_sauce(calc, start, stones);
        const YBStructResult structure = build_nonweave(calc, gates, year, structSauce);
        std::vector<BatchRecord> days;
        if (includeDays) {
            days = compute_full_year_days(calc, gates, year, structSauce, structure, params);
        }

        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-year-structure\",\"calcJdn\":" << calc
                  << ",\"year\":" << year.num << ",\"startJdn\":" << start << ",\"endJdn\":" << end
                  << ",\"lengthDays\":" << length << ",\"cutlets\":[";
        for (int i = 0; i < structure.cutletCount; ++i) {
            if (i) std::cout << ',';
            std::cout << "{\"cutletIndex\":" << structure.cutName[i]
                      << ",\"startOffset\":" << structure.cutStart[i]
                      << ",\"endOffset\":" << structure.cutEnd[i]
                      << ",\"lengthDays\":" << (structure.cutEnd[i] - structure.cutStart[i] + 1) << '}';
        }
        std::cout << "],\"months\":[";
        for (int i = 0; i < structure.monthCount; ++i) {
            if (i) std::cout << ',';
            std::cout << "{\"monthIndex\":" << structure.monthName[i]
                      << ",\"lengthDays\":" << structure.monthLen[i] << '}';
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
#endif
