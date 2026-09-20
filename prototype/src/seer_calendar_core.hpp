#pragma once
#include "seer_year_core.hpp"
#include <cstdint>
#include <vector>

namespace seer_native {

struct ExecutionParams {
    int threads=3;
    int superblock=512;
    int replayThreads=3;
};

struct BatchRecord {
    int64_t targetJdn=0;
    long long year=0;
    int cutletIndex=0;
    int dayInCutlet=0;
    int monthIndex=0;
    int dayInMonth=0;
    int cutletCount=0;
    int monthCount=0;
};

namespace detail {

struct YBStructResult {
    int cutletCount=0,monthCount=0;
    std::vector<int> cutGaps,cutName,cutStart,cutEnd,monthLen,monthName;
};

YBStructResult build_nonweave(
    int64_t calc,const FGates& gates,const FY& year,const FSauce& structSauce);

std::vector<BatchRecord> compute_segment(
    int64_t calc,int64_t first,int64_t last,
    const FGates& gates,const FStones& stones,const FY& year,
    const ExecutionParams& params);

std::vector<BatchRecord> compute_full_year_days(
    const FY& year,const FSauce& structSauce,
    const YBStructResult& structure,const ExecutionParams& params);

} // namespace detail
} // namespace seer_native
