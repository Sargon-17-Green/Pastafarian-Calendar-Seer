#include "seer_calendar_core.hpp"

using seer_native::BatchRecord;
using seer_native::ExecutionParams;
using seer_native::detail::FGates;
using seer_native::detail::FY;
using seer_native::detail::YBStructResult;
using seer_native::detail::build_nonweave;
using seer_native::detail::compute_full_year_days;
using seer_native::detail::compute_segment;
using seer_native::detail::fadj;
using seer_native::detail::fanchor;

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <fstream>
#include <iostream>
#include <limits>
#include <list>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

struct ServiceCounters {
    uint64_t requests = 0;
    uint64_t anchors = 0;
    uint64_t nextSteps = 0;
    uint64_t prevSteps = 0;
    uint64_t evictions = 0;
};

class ServiceRequestError : public std::runtime_error {
    std::string code_;
public:
    ServiceRequestError(std::string code, const std::string& message)
        : std::runtime_error(message), code_(std::move(code)) {}
    const std::string& code() const noexcept { return code_; }
};

static bool svc_is_domain_boundary(const std::exception& e) {
    const std::string m = e.what();
    return m == "day beyond bidirectional gate corpus" ||
           m == "no anchor candidates in gate corpus" ||
           m == "no previous year in gate corpus" ||
           m == "no next year in gate corpus" ||
           m == "gate index";
}

static std::string svc_json_escape(const std::string& s) {
    std::ostringstream out;
    for (unsigned char ch : s) {
        switch (ch) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (ch < 0x20) {
                    static const char* hex = "0123456789abcdef";
                    out << "\\u00" << hex[(ch >> 4) & 0xf] << hex[ch & 0xf];
                } else {
                    out << static_cast<char>(ch);
                }
        }
    }
    return out.str();
}

static size_t svc_env_limit(const char* name, size_t fallback, size_t lo, size_t hi) {
    const char* raw = std::getenv(name);
    if (!raw || !*raw) return fallback;
    try {
        unsigned long long value = std::stoull(raw);
        if (value < lo || value > hi) return fallback;
        return static_cast<size_t>(value);
    } catch (...) {
        return fallback;
    }
}

static void svc_counter_event(const char* kind, int64_t calc, long long year) {
    const char* path = std::getenv("SEER_TEST_CHAIN_COUNTER_FILE");
    if (!path || !*path) return;
    std::ofstream out(path, std::ios::app);
    if (out) out << kind << '\t' << calc << '\t' << year << '\n';
}

class ServiceYearChain {
    int64_t calc_;
    const FGates& gates_;
    const FStones& stones_;
    ServiceCounters& counters_;
    std::deque<FY> years_;

    void extendPrevious() {
        FY y = fadj(calc_, gates_, stones_, years_.front(), false);
        years_.push_front(y);
        counters_.prevSteps++;
        svc_counter_event("prev", calc_, y.num);
    }

    void extendNext() {
        FY y = fadj(calc_, gates_, stones_, years_.back(), true);
        years_.push_back(y);
        counters_.nextSteps++;
        svc_counter_event("next", calc_, y.num);
    }

public:
    ServiceYearChain(int64_t calc, const FGates& gates, const FStones& stones, ServiceCounters& counters)
        : calc_(calc), gates_(gates), stones_(stones), counters_(counters) {
        FY anchor = fanchor(calc_, gates_, stones_);
        years_.push_back(anchor);
        counters_.anchors++;
        svc_counter_event("anchor", calc_, anchor.num);
    }

    FY byYear(long long requested) {
        while (requested < years_.front().num) extendPrevious();
        while (requested > years_.back().num) extendNext();
        const long long offset = requested - years_.front().num;
        if (offset < 0 || static_cast<size_t>(offset) >= years_.size()) {
            throw std::runtime_error("year chain indexing failure");
        }
        const FY y = years_[static_cast<size_t>(offset)];
        if (y.num != requested) throw std::runtime_error("year chain number mismatch");
        return y;
    }

    FY byTarget(int64_t target) {
        while (target < years_.front().a + 1) extendPrevious();
        while (target > years_.back().b) extendNext();

        size_t lo = 0, hi = years_.size();
        while (lo < hi) {
            const size_t mid = lo + (hi - lo) / 2;
            if (years_[mid].b < target) lo = mid + 1;
            else hi = mid;
        }
        if (lo >= years_.size()) throw std::runtime_error("target not found in covered year chain");
        const FY y = years_[lo];
        if (target < y.a + 1 || target > y.b) throw std::runtime_error("target fell in a year-chain gap");
        return y;
    }

    long long firstYear() const { return years_.front().num; }
    long long lastYear() const { return years_.back().num; }
    size_t size() const { return years_.size(); }
};

class SeerEngineService {
    FGates gates_;
    FStones stones_;
    ServiceCounters counters_;
    size_t maxCalcs_;
    std::list<int64_t> lru_;

    struct Entry {
        std::unique_ptr<ServiceYearChain> chain;
        std::list<int64_t>::iterator lruIt;
    };
    std::unordered_map<int64_t, Entry> chains_;

    ServiceYearChain& chainFor(int64_t calc) {
        auto it = chains_.find(calc);
        if (it != chains_.end()) {
            lru_.erase(it->second.lruIt);
            lru_.push_back(calc);
            it->second.lruIt = std::prev(lru_.end());
            return *it->second.chain;
        }

        while (chains_.size() >= maxCalcs_ && !lru_.empty()) {
            const int64_t victim = lru_.front();
            lru_.pop_front();
            chains_.erase(victim);
            counters_.evictions++;
        }

        lru_.push_back(calc);
        auto lruIt = std::prev(lru_.end());
        Entry entry{std::make_unique<ServiceYearChain>(calc, gates_, stones_, counters_), lruIt};
        auto [inserted, ok] = chains_.emplace(calc, std::move(entry));
        if (!ok) throw std::runtime_error("failed to create calculation-day year chain");
        return *inserted->second.chain;
    }

    static void printRecord(const BatchRecord& r) {
        std::cout << "{\"targetJdn\":" << r.targetJdn << ",\"year\":" << r.year
                  << ",\"cutletIndex\":" << r.cutletIndex << ",\"dayInCutlet\":" << r.dayInCutlet
                  << ",\"monthIndex\":" << r.monthIndex << ",\"dayInMonth\":" << r.dayInMonth
                  << ",\"cutletCount\":" << r.cutletCount << ",\"monthCount\":" << r.monthCount << '}';
    }

    static std::vector<std::string> fields(const std::string& line) {
        std::vector<std::string> out;
        size_t start = 0;
        for (;;) {
            const size_t tab = line.find('\t', start);
            if (tab == std::string::npos) {
                out.push_back(line.substr(start));
                break;
            }
            out.push_back(line.substr(start, tab - start));
            start = tab + 1;
        }
        return out;
    }

    void handleRange(const std::vector<std::string>& f) {
        if (f.size() != 4) throw std::runtime_error("R expects calc, target_start and count");
        const int64_t calc = std::stoll(f[1]);
        const int64_t start = std::stoll(f[2]);
        const long long count = std::stoll(f[3]);
        if (count < 1 || count > 10000) throw std::runtime_error("count must be in 1..10000");
        const int64_t delta = count - 1;
        if (start > std::numeric_limits<int64_t>::max() - delta) {
            throw ServiceRequestError("TARGET_OUT_OF_SUPPORTED_DOMAIN", "target range overflow");
        }
        const int64_t end = start + static_cast<int64_t>(count) - 1;
        const int64_t minDay = gates_.at(gates_.min_index());
        const int64_t maxDay = gates_.at(gates_.max_index());
        if (calc <= minDay || calc > maxDay) {
            throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", "calculation day beyond bidirectional gate corpus");
        }
        if (start <= minDay || end > maxDay) {
            throw ServiceRequestError("TARGET_OUT_OF_SUPPORTED_DOMAIN", "target range beyond bidirectional gate corpus");
        }

        ServiceYearChain* chainPtr = nullptr;
        try {
            chainPtr = &chainFor(calc);
        } catch (const std::exception& e) {
            if (svc_is_domain_boundary(e)) throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", e.what());
            throw;
        }
        ServiceYearChain& chain = *chainPtr;
        FY y;
        try {
            y = chain.byTarget(start);
        } catch (const std::exception& e) {
            if (svc_is_domain_boundary(e)) throw ServiceRequestError("TARGET_OUT_OF_SUPPORTED_DOMAIN", e.what());
            throw;
        }
        std::vector<BatchRecord> records;
        records.reserve(static_cast<size_t>(count));
        int64_t cursor = start;
        while (cursor <= end) {
            const int64_t segmentEnd = std::min<int64_t>(end, y.b);
            auto part = compute_segment(calc, cursor, segmentEnd, gates_, stones_, y, ExecutionParams{});
            records.insert(records.end(), part.begin(), part.end());
            if (segmentEnd == end) break;
            cursor = segmentEnd + 1;
            try {
                y = chain.byYear(y.num + 1);
            } catch (const std::exception& e) {
                if (svc_is_domain_boundary(e)) throw ServiceRequestError("TARGET_OUT_OF_SUPPORTED_DOMAIN", e.what());
                throw;
            }
        }
        if (records.size() != static_cast<size_t>(count)) throw std::runtime_error("service batch record count mismatch");

        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-avx2-batch\",\"calcJdn\":" << calc
                  << ",\"targetStartJdn\":" << start << ",\"targetCount\":" << count << ",\"records\":[";
        for (size_t i = 0; i < records.size(); ++i) {
            if (i) std::cout << ',';
            printRecord(records[i]);
        }
        std::cout << "]}\n";
    }

    void handleYear(const std::vector<std::string>& f) {
        if (f.size() != 4) throw std::runtime_error("Y expects calc, year and include_days");
        const int64_t calc = std::stoll(f[1]);
        const long long requested = std::stoll(f[2]);
        const int includeDays = std::stoi(f[3]);
        if (includeDays != 0 && includeDays != 1) throw std::runtime_error("include_days must be 0 or 1");

        ServiceYearChain* chainPtr = nullptr;
        try {
            chainPtr = &chainFor(calc);
        } catch (const std::exception& e) {
            if (svc_is_domain_boundary(e)) throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", e.what());
            throw;
        }
        ServiceYearChain& chain = *chainPtr;
        FY y;
        try {
            y = chain.byYear(requested);
        } catch (const std::exception& e) {
            if (svc_is_domain_boundary(e)) throw ServiceRequestError("YEAR_OUT_OF_SUPPORTED_DOMAIN", e.what());
            throw;
        }
        const int64_t start = y.a + 1, end = y.b, length = y.b - y.a;
        if (length < 1 || length > 10000) throw std::runtime_error("located year length is outside supported limit");

        const FSauce structSauce = fast_sauce(calc, start, stones_);
        const YBStructResult st = build_nonweave(calc, gates_, y, structSauce);
        std::vector<BatchRecord> days;
        if (includeDays) days = compute_full_year_days(calc, gates_, y, structSauce, st, ExecutionParams{});

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
                printRecord(days[i]);
            }
            std::cout << ']';
        }
        std::cout << "}\n";
    }

    void handleStats() {
        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-engine-service\",\"stats\":{"
                  << "\"requests\":" << counters_.requests
                  << ",\"anchors\":" << counters_.anchors
                  << ",\"nextSteps\":" << counters_.nextSteps
                  << ",\"prevSteps\":" << counters_.prevSteps
                  << ",\"evictions\":" << counters_.evictions
                  << ",\"activeCalcs\":" << chains_.size()
                  << ",\"maxCalcs\":" << maxCalcs_
                  << "},\"chains\":[";
        bool first = true;
        for (int64_t calc : lru_) {
            auto it = chains_.find(calc);
            if (it == chains_.end()) continue;
            if (!first) std::cout << ',';
            first = false;
            const auto& chain = *it->second.chain;
            std::cout << "{\"calcJdn\":" << calc << ",\"firstYear\":" << chain.firstYear()
                      << ",\"lastYear\":" << chain.lastYear() << ",\"yearCount\":" << chain.size() << '}';
        }
        std::cout << "]}\n";
    }

public:
    SeerEngineService()
        : gates_("gates_100k_u16.bin", "gates_negative_100k_u16.bin"),
          stones_(fast_stones()),
          maxCalcs_(svc_env_limit("SEER_SERVICE_MAX_CALCS", 8, 1, 64)) {}

    void handle(const std::string& line) {
        const auto f = fields(line);
        if (f.empty() || f[0].empty()) return;
        counters_.requests++;
        if (f[0] == "R") handleRange(f);
        else if (f[0] == "Y") handleYear(f);
        else if (f[0] == "S" && f.size() == 1) handleStats();
        else throw std::runtime_error("unknown service command");
        std::cout << std::flush;
    }
};

int main() {
    try {
        SeerEngineService service;
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line == "X") break;
            try {
                service.handle(line);
            } catch (const ServiceRequestError& e) {
                std::cout << "{\"schema\":1,\"ok\":false,\"code\":\""
                          << svc_json_escape(e.code()) << "\",\"error\":\""
                          << svc_json_escape(e.what()) << "\"}\n" << std::flush;
            } catch (const std::exception& e) {
                std::cout << "{\"schema\":1,\"ok\":false,\"error\":\""
                          << svc_json_escape(e.what()) << "\"}\n" << std::flush;
            }
        }
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "seer_engine_service: " << e.what() << '\n';
        return 1;
    }
}
