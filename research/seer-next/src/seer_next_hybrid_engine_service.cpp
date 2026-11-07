// Seer Next separate research variant: S4 exact-day cache plus S2 full-year cache.
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
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <exception>
#include <fstream>
#include <functional>
#include <stdexcept>
#include <iostream>
#include <limits>
#include <list>
#include <memory>
#ifdef __linux__
#include <sys/resource.h>
#include <cerrno>
#include <cstring>
#endif
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
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

// Research configuration: exact arithmetic is unchanged; only parallelism differs.
// The primary service and its wire schema are not modified.
static std::string seer_next_execution_profile() {
    const char*raw=std::getenv("SEER_NEXT_EXECUTION_PROFILE");
    return raw&&*raw?std::string(raw):std::string("latency");
}
static ExecutionParams seer_next_execution_params() {
    const std::string p=seer_next_execution_profile();
    if(p=="latency")return ExecutionParams{3,512,3};
    if(p=="balanced")return ExecutionParams{3,512,1};
    if(p=="memory")return ExecutionParams{1,512,1};
    // Research opt-in from 48 exact cold A/B comparisons. NOT the default.
    if(p=="experimental4")return ExecutionParams{4,512,1};
    // Research-only cross-year result: four RNS builders, two replay workers.
    // Opt-in only, after success of the 180 native cold-differential checks.
    if(p=="experimental42")return ExecutionParams{4,512,2};
    throw std::runtime_error("SEER_NEXT_EXECUTION_PROFILE must be latency, balanced, memory, experimental4 or experimental42");
}

class SeerEngineService {
    FGates gates_;
    FStones stones_;
    ServiceCounters counters_;
    size_t maxCalcs_;
    std::list<int64_t> lru_;
    struct MemoKey {
        int64_t calc;
        long long year;
        bool operator==(const MemoKey& x) const noexcept {
            return calc == x.calc && year == x.year;
        }
    };
    struct MemoHash {
        size_t operator()(const MemoKey& k) const noexcept {
            size_t a = std::hash<int64_t>{}(k.calc);
            size_t b = std::hash<long long>{}(k.year);
            return a ^ (b + size_t(0x9e3779b97f4a7c15ULL) + (a << 6) + (a >> 2));
        }
    };
    struct MemoEntry {
        size_t seen = 0;
        std::vector<BatchRecord> records;
        std::list<MemoKey>::iterator age;
    };
    static constexpr size_t MAX_MEMO_KEYS = 256;
    size_t memoLimitBytes_;
    size_t memoUsedBytes_ = 0;
    size_t memoPromoteAfter_;
    std::list<MemoKey> memoAge_;
    std::unordered_map<MemoKey, MemoEntry, MemoHash> memo_;
    uint64_t memoHits_ = 0, memoBuilds_ = 0, memoEvictions_ = 0;

    struct DayKey {
        int64_t calc, target;
        bool operator==(const DayKey& x) const noexcept {
            return calc == x.calc && target == x.target;
        }
    };
    struct DayHash {
        size_t operator()(const DayKey& k) const noexcept {
            const size_t a=std::hash<int64_t>{}(k.calc);
            const size_t b=std::hash<int64_t>{}(k.target);
            return a ^ (b+size_t(0x9e3779b97f4a7c15ULL)+(a<<6)+(a>>2));
        }
    };
    struct DayEntry {
        BatchRecord record;
        std::list<DayKey>::iterator age;
    };
    static constexpr size_t MAX_DAY_KEYS=2048;
    size_t dayLimitBytes_;
    std::list<DayKey> dayLru_;
    std::unordered_map<DayKey,DayEntry,DayHash> days_;
    uint64_t dayHits_=0,dayStores_=0,dayEvictions_=0;

    bool lookupDay(int64_t calc,int64_t target,BatchRecord& result) {
        if(dayLimitBytes_<sizeof(BatchRecord))return false;
        auto it=days_.find(DayKey{calc,target});
        if(it==days_.end())return false;
        dayLru_.splice(dayLru_.end(),dayLru_,it->second.age);
        it->second.age=std::prev(dayLru_.end());
        result=it->second.record;
        if(result.targetJdn!=target)throw std::logic_error("day memo target mismatch");
        ++dayHits_;
        return true;
    }

    void storeDay(int64_t calc,int64_t target,const BatchRecord& record) {
        if(dayLimitBytes_<sizeof(BatchRecord))return;
        if(record.targetJdn!=target)throw std::logic_error("day memo record mismatch");
        DayKey key{calc,target};
        auto it=days_.find(key);
        if(it!=days_.end()){
            it->second.record=record;
            dayLru_.splice(dayLru_.end(),dayLru_,it->second.age);
            it->second.age=std::prev(dayLru_.end());
            return;
        }
        const size_t capacity=std::min(MAX_DAY_KEYS,dayLimitBytes_/sizeof(BatchRecord));
        if(capacity==0)return;
        while(days_.size()>=capacity){
            if(dayLru_.empty())throw std::logic_error("day memo LRU accounting");
            days_.erase(dayLru_.front());
            dayLru_.pop_front();
            ++dayEvictions_;
        }
        dayLru_.push_back(key);
        auto [inserted,ok]=days_.emplace(key,DayEntry{record,std::prev(dayLru_.end())});
        if(!ok)throw std::logic_error("day memo insert failure");
        ++dayStores_;
    }


    void evictMemo() {
        if (memoAge_.empty()) return;
        const MemoKey victim = memoAge_.front();
        auto it = memo_.find(victim);
        if (it != memo_.end()) {
            const size_t bytes = it->second.records.size() * sizeof(BatchRecord);
            if (bytes > memoUsedBytes_) throw std::logic_error("year cache accounting underflow");
            memoUsedBytes_ -= bytes;
            memo_.erase(it);
        }
        memoAge_.pop_front();
        ++memoEvictions_;
    }

    const std::vector<BatchRecord>* yearRecords(int64_t calc, const FY& y) {
        if (memoLimitBytes_ == 0) return nullptr;
        const MemoKey key{calc, y.num};
        auto it = memo_.find(key);
        if (it == memo_.end()) {
            if (memo_.size() >= MAX_MEMO_KEYS) evictMemo();
            memoAge_.push_back(key);
            auto insertion = memo_.emplace(
                key, MemoEntry{0, {}, std::prev(memoAge_.end())});
            if (!insertion.second) throw std::logic_error("year cache key failure");
            it = insertion.first;
        } else {
            memoAge_.splice(memoAge_.end(), memoAge_, it->second.age);
            it->second.age = std::prev(memoAge_.end());
        }
        MemoEntry& e = it->second;
        const int64_t length = y.b - y.a;
        if (!e.records.empty()) {
            if (e.records.size() != static_cast<size_t>(length) ||
                e.records.front().targetJdn != y.a + 1 ||
                e.records.back().targetJdn != y.b) {
                throw std::logic_error("year cache boundaries mismatch");
            }
            ++memoHits_;
            return &e.records;
        }
        ++e.seen;
        if (e.seen < memoPromoteAfter_) return nullptr;
        if (length <= 0 || length > 5778) return nullptr;
        const size_t required = static_cast<size_t>(length) * sizeof(BatchRecord);
        if (required > memoLimitBytes_) return nullptr;
        // The requested key is newest, still without payload.
        while (memoUsedBytes_ > memoLimitBytes_ - required) {
            if (memoAge_.size() <= 1) throw std::logic_error("year cache eviction invariant");
            evictMemo();
        }
        const FSauce sauce = fast_sauce(calc, y.a + 1, stones_);
        const YBStructResult st = build_nonweave(calc, gates_, y, sauce);
        auto whole = compute_full_year_days(calc, gates_, y, sauce, st, seer_next_execution_params());
        if (whole.size() != static_cast<size_t>(length) ||
            whole.front().targetJdn != y.a + 1 || whole.back().targetJdn != y.b) {
            throw std::runtime_error("year cache full build failed validation");
        }
        e.records = std::move(whole); // only fully verified table is published
        memoUsedBytes_ += required;
        ++memoBuilds_;
        return &e.records;
    }

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
            std::vector<BatchRecord> part;
            const bool single=(cursor==segmentEnd);
            BatchRecord hit{};
            if(single && lookupDay(calc,cursor,hit)){
                if(hit.year!=y.num)throw std::logic_error("day memo year mismatch");
                part.push_back(hit);
            } else {
                if(const auto* full=yearRecords(calc,y)){
                    const size_t first=static_cast<size_t>(cursor-(y.a+1));
                    const size_t beyond=static_cast<size_t>(segmentEnd-y.a);
                    if(beyond>full->size()||first>=beyond)
                        throw std::logic_error("hybrid year memo segment invalid");
                    part.assign(full->begin()+first,full->begin()+beyond);
                } else {
                    part=compute_segment(calc,cursor,segmentEnd,gates_,stones_,y,seer_next_execution_params());
                }
                if(single&&part.size()==1)storeDay(calc,cursor,part.front());
            }
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

    void handleDiagonal(const std::vector<std::string>& f) {
        if (f.size() != 4) throw std::runtime_error("D expects target_start, count and step_days");
        const int64_t start = std::stoll(f[1]);
        const long long count = std::stoll(f[2]);
        const int64_t step = std::stoll(f[3]);
        if (count < 1 || count > 10000) throw std::runtime_error("count must be in 1..10000");
        if (step == 0) throw std::runtime_error("step_days must not be zero");

        const __int128 lastWide = static_cast<__int128>(start) +
            static_cast<__int128>(count - 1) * static_cast<__int128>(step);
        if (lastWide < std::numeric_limits<int64_t>::min() ||
            lastWide > std::numeric_limits<int64_t>::max()) {
            throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", "diagonal range overflow");
        }
        const int64_t last = static_cast<int64_t>(lastWide);
        const int64_t minDay = gates_.at(gates_.min_index());
        const int64_t maxDay = gates_.at(gates_.max_index());
        const int64_t lo = std::min(start, last);
        const int64_t hi = std::max(start, last);
        if (lo <= minDay || hi > maxDay) {
            throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", "calculation day beyond bidirectional gate corpus");
        }

        std::vector<BatchRecord> records(static_cast<size_t>(count));
        std::atomic<size_t> next{0};
        std::atomic<bool> failed{false};
        std::mutex errorMutex;
        std::exception_ptr firstError;
        const size_t requestedWorkers = seer_next_execution_profile()=="memory"
            ? 1 : svc_env_limit("SEER_DIAGONAL_THREADS", 3, 1, 16);
        const size_t hardware = std::max<unsigned>(1, std::thread::hardware_concurrency());
        const size_t workers = std::min({requestedWorkers, hardware, static_cast<size_t>(count)});

        auto work = [&]() {
            while (!failed.load(std::memory_order_relaxed)) {
                const size_t i = next.fetch_add(1, std::memory_order_relaxed);
                if (i >= static_cast<size_t>(count)) return;
                try {
                    const __int128 dayWide = static_cast<__int128>(start) +
                        static_cast<__int128>(i) * static_cast<__int128>(step);
                    const int64_t day = static_cast<int64_t>(dayWide);
                    const FY anchor = fanchor(day, gates_, stones_);
                    auto one = compute_segment(day, day, day, gates_, stones_, anchor,
                                               ExecutionParams{1, 512, 1});
                    if (one.size() != 1 || one[0].targetJdn != day) {
                        throw std::runtime_error("diagonal record mismatch");
                    }
                    records[i] = one[0];
                } catch (...) {
                    if (!failed.exchange(true, std::memory_order_relaxed)) {
                        std::lock_guard<std::mutex> lock(errorMutex);
                        firstError = std::current_exception();
                    }
                    return;
                }
            }
        };

        std::vector<std::thread> pool;
        pool.reserve(workers > 0 ? workers - 1 : 0);
        for (size_t i = 1; i < workers; ++i) pool.emplace_back(work);
        work();
        for (auto& thread : pool) thread.join();
        if (firstError) {
            try {
                std::rethrow_exception(firstError);
            } catch (const std::exception& e) {
                if (svc_is_domain_boundary(e)) {
                    throw ServiceRequestError("CALCULATION_OUT_OF_SUPPORTED_DOMAIN", e.what());
                }
                throw;
            }
        }

        std::cout << "{\"schema\":1,\"engine\":\"seer-v12-avx2-batch\",\"targetStartJdn\":" << start
                  << ",\"targetCount\":" << count << ",\"stepDays\":" << step << ",\"records\":[";
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
        if (includeDays) days = compute_full_year_days(calc, gates_, y, structSauce, st, seer_next_execution_params());

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

    // Research-only diagnostics. The baseline S command and all public responses are unchanged.
    // Candidate-only instrumentation. No changes to production S/R/Y/D replies.
    void handleMemoStats() {
        std::cout << "{\"schema\":1,\"engine\":\"seer-next-hybrid-experimental\",\"memo\":{"
                  << "\"hits\":" << memoHits_
                  << ",\"builds\":" << memoBuilds_
                  << ",\"evictions\":" << memoEvictions_
                  << ",\"keys\":" << memo_.size()
                  << ",\"payloadBytes\":" << memoUsedBytes_
                  << ",\"payloadBudgetBytes\":" << memoLimitBytes_
                  << ",\"promoteAfter\":" << memoPromoteAfter_
                  << ",\"dayHits\":" << dayHits_
                  << ",\"dayStores\":" << dayStores_
                  << ",\"dayEvictions\":" << dayEvictions_
                  << ",\"dayEntries\":" << days_.size()
                  << ",\"dayPayloadBytes\":" << days_.size()*sizeof(BatchRecord)
                  << ",\"dayBudgetBytes\":" << dayLimitBytes_
                  << "}}\n";
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
          maxCalcs_(svc_env_limit("SEER_SERVICE_MAX_CALCS", 8, 1, 64)),
          memoLimitBytes_(svc_env_limit("SEER_NEXT_CACHE_BYTES", 8 * 1024 * 1024, 0, 64 * 1024 * 1024)),
          memoPromoteAfter_(svc_env_limit("SEER_NEXT_PROMOTE_AFTER", 2, 1, 1000)),
          dayLimitBytes_(svc_env_limit("SEER_NEXT_DAY_CACHE_BYTES", 64 * 1024, 0, 1024 * 1024)) {}

    void handle(const std::string& line) {
        const auto f = fields(line);
        if (f.empty() || f[0].empty()) return;
        counters_.requests++;
        if (f[0] == "R") handleRange(f);
        else if (f[0] == "D") handleDiagonal(f);
        else if (f[0] == "Y") handleYear(f);
        else if (f[0] == "S" && f.size() == 1) handleStats();
        else if (f[0] == "M" && f.size() == 1) handleMemoStats();
        else throw std::runtime_error("unknown service command");
        std::cout << std::flush;
    }
};

// Seer Next research-only address-space limit. This is NOT an RSS/cgroup
// guarantee and it applies only to Linux. Explicit unsupported mode is rejected.
static void seer_next_apply_as_limit() {
    const char* raw=std::getenv("SEER_NEXT_MAX_VIRTUAL_BYTES");
    if(!raw || !*raw || std::string(raw)=="0") return;
#ifdef __linux__
    size_t end=0;
    unsigned long long value=std::stoull(std::string(raw),&end,10);
    if(end!=std::strlen(raw) || value<64ULL*1024*1024 ||
       value>1ULL*1024*1024*1024*1024)
        throw std::runtime_error("SEER_NEXT_MAX_VIRTUAL_BYTES must be 0 or 64MiB..1TiB");
    // Conservative fail-fast for low caps with multi-worker modes. The threshold
    // is experimental policy, NOT a proof that all larger budgets are sufficient.
    if(value<512ULL*1024*1024 && seer_next_execution_profile()!="memory")
        throw std::runtime_error("virtual cap below 512MiB requires SEER_NEXT_EXECUTION_PROFILE=memory");
    struct rlimit old{};
    if(getrlimit(RLIMIT_AS,&old)!=0)
        throw std::runtime_error(std::string("getrlimit(RLIMIT_AS): ")+std::strerror(errno));
    const auto requested=static_cast<rlim_t>(value);
    struct rlimit bounded=old;
    if(bounded.rlim_cur==RLIM_INFINITY || bounded.rlim_cur>requested)
        bounded.rlim_cur=requested;
    if(setrlimit(RLIMIT_AS,&bounded)!=0)
        throw std::runtime_error(std::string("setrlimit(RLIMIT_AS): ")+std::strerror(errno));
#else
    throw std::runtime_error("SEER_NEXT_MAX_VIRTUAL_BYTES supported only on Linux");
#endif
}

int main() {
    try {
        seer_next_apply_as_limit();
        (void)seer_next_execution_params(); // validate profile at startup
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
