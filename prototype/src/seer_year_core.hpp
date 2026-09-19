#pragma once
#include "sauce_fast127_v12.hpp"

#include <cstdint>
#include <vector>

namespace seer_native::detail {

class FGates {
public:
    static constexpr int64_t FOUNDATION_JDN = -13334246LL;
    static constexpr int LEGACY_RADIUS = 40000;

    explicit FGates(
        const char* positiveFilename,
        const char* negativeFilename = "gates_negative_u16.bin");

    int min_index() const;
    int max_index() const;
    bool has_legacy_domain() const;
    int64_t at(int gate) const;
    int contain(int64_t day) const;
    bool in_legacy_day_domain(int64_t day) const;

private:
    int radius_ = 0;
    std::vector<int64_t> p;

    static std::vector<uint16_t> load_gaps(const char* filename);
};

struct FY {
    long long num;
    int o;
    int c;
    int64_t a;
    int64_t b;
};

FY fanchor(int64_t calc, const FGates& gates, const FStones& stones);
FY fadj(int64_t calc, const FGates& gates, const FStones& stones, const FY& year, bool next);

} // namespace seer_native::detail
