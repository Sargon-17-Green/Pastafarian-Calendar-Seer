#pragma once
#include "sauce_fast127_v12.hpp"
#include <vector>
#include <atomic>
namespace seer_native::detail {
void set_thread_cancel_flag(const std::atomic_bool* flag);
std::vector<int> weave_month_prefix(
    const std::vector<int>& monthLengths,
    const FSauce& structSauce,
    int stopPositions,
    int threads,
    int superblock,
    int replayThreads);
} // namespace seer_native::detail
