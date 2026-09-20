#include "../include/seer_mobile.h"
#include "seer_calendar_core.hpp"
#include "seer_weave_core.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <exception>
#include <limits>
#include <mutex>
#include <new>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#ifndef SEER_BUILD_COMMIT
#define SEER_BUILD_COMMIT "unknown"
#endif
#ifndef SEER_PACKAGE_VERSION
#define SEER_PACKAGE_VERSION "0.2.3"
#endif

using seer_native::BatchRecord;
using seer_native::ExecutionParams;
using seer_native::detail::FGates;
using seer_native::detail::FY;
using seer_native::detail::compute_segment;
using seer_native::detail::fadj;
using seer_native::detail::fanchor;
using seer_native::detail::set_thread_cancel_flag;

struct seer_mobile_cancel_token {
    std::atomic_bool cancelled{false};
    std::atomic_uint32_t refs{1};
};

struct seer_mobile_context {
    std::atomic_uint32_t refs{1};
    FGates gates;
    FStones stones;
    ExecutionParams params;
    uint32_t max_concurrent;
    uint32_t max_queued;
    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    uint32_t active = 0;
    uint32_t queued = 0;

    explicit seer_mobile_context(const seer_mobile_config& c)
        : gates(c.positive_gate_path, c.negative_gate_path),
          stones(fast_stones()),
          max_concurrent(c.max_concurrent == 0 ? 1u : c.max_concurrent),
          max_queued(c.max_queued) {
        params.threads = c.weave_threads > 0 ? c.weave_threads : 1;
        params.superblock = c.superblock > 0 ? c.superblock : 512;
        params.replayThreads = c.replay_threads > 0 ? c.replay_threads : 1;
    }
};

namespace {

struct Cancelled final : std::exception {
    const char* what() const noexcept override { return "seer cancelled"; }
};

static bool cancelled(const seer_mobile_cancel_token* token) {
    return token && token->cancelled.load(std::memory_order_relaxed);
}

static void clear_error(seer_mobile_error* error) {
    if (!error) return;
    error->struct_size = static_cast<uint32_t>(sizeof(*error));
    error->status = SEER_MOBILE_OK;
    error->message[0] = '\0';
}

static void set_error(seer_mobile_error* error, seer_mobile_status status, const char* message) {
    if (!error) return;
    error->struct_size = static_cast<uint32_t>(sizeof(*error));
    error->status = status;
    const char* src = message ? message : "";
    std::strncpy(error->message, src, SEER_MOBILE_ERROR_MESSAGE_CAPACITY - 1);
    error->message[SEER_MOBILE_ERROR_MESSAGE_CAPACITY - 1] = '\0';
}

template <size_t N>
static void copy_identity(char (&dst)[N], const char* src) {
    std::strncpy(dst, src ? src : "", N - 1);
    dst[N - 1] = '\0';
}

enum class SlotResult { acquired, cancelled, full };

class SlotGuard {
public:
    SlotGuard(seer_mobile_context& context, const seer_mobile_cancel_token* token)
        : context_(context) {
        std::unique_lock<std::mutex> lock(context_.queue_mutex);
        if (context_.active >= context_.max_concurrent) {
            if (context_.queued >= context_.max_queued) {
                result_ = SlotResult::full;
                return;
            }
            ++context_.queued;
            queued_ = true;
            while (context_.active >= context_.max_concurrent) {
                if (cancelled(token)) {
                    --context_.queued;
                    queued_ = false;
                    result_ = SlotResult::cancelled;
                    return;
                }
                context_.queue_cv.wait_for(lock, std::chrono::milliseconds(5));
            }
            --context_.queued;
            queued_ = false;
        }
        if (cancelled(token)) {
            result_ = SlotResult::cancelled;
            return;
        }
        ++context_.active;
        acquired_ = true;
        result_ = SlotResult::acquired;
    }

    ~SlotGuard() {
        if (!acquired_) return;
        {
            std::lock_guard<std::mutex> lock(context_.queue_mutex);
            --context_.active;
        }
        context_.queue_cv.notify_one();
    }

    SlotResult result() const { return result_; }

private:
    seer_mobile_context& context_;
    bool acquired_ = false;
    bool queued_ = false;
    SlotResult result_ = SlotResult::full;
};

class CancelScope {
public:
    explicit CancelScope(const seer_mobile_cancel_token* token) {
        flag_ = token ? &token->cancelled : nullptr;
        set_thread_cancel_flag(flag_);
    }
    ~CancelScope() { set_thread_cancel_flag(nullptr); }
private:
    const std::atomic_bool* flag_ = nullptr;
};

static void validate_domain(
    const seer_mobile_context& context,
    int64_t calculation_jdn,
    int64_t target_jdn) {
    const int64_t min_day = context.gates.at(context.gates.min_index());
    const int64_t max_day = context.gates.at(context.gates.max_index());
    if (calculation_jdn <= min_day || calculation_jdn > max_day) {
        throw std::out_of_range("calculation day beyond bidirectional gate corpus");
    }
    if (target_jdn <= min_day || target_jdn > max_day) {
        throw std::range_error("target day beyond bidirectional gate corpus");
    }
}

static FY target_year(
    int64_t calculation_jdn,
    int64_t target_jdn,
    const FGates& gates,
    const FStones& stones,
    const seer_mobile_cancel_token* token) {
    if (cancelled(token)) throw Cancelled{};
    FY year = fanchor(calculation_jdn, gates, stones);
    while (target_jdn < year.a + 1) {
        if (cancelled(token)) throw Cancelled{};
        year = fadj(calculation_jdn, gates, stones, year, false);
    }
    while (target_jdn > year.b) {
        if (cancelled(token)) throw Cancelled{};
        year = fadj(calculation_jdn, gates, stones, year, true);
    }
    return year;
}

static seer_mobile_record to_c_record(const BatchRecord& r) {
    return {
        r.targetJdn,
        static_cast<int64_t>(r.year),
        r.cutletIndex,
        r.dayInCutlet,
        r.monthIndex,
        r.dayInMonth,
        r.cutletCount,
        r.monthCount
    };
}

static seer_mobile_record compute_one(
    seer_mobile_context& context,
    int64_t calculation_jdn,
    int64_t target_jdn,
    const seer_mobile_cancel_token* token) {
    validate_domain(context, calculation_jdn, target_jdn);
    if (cancelled(token)) throw Cancelled{};
    FY year{};
    try {
        year = target_year(calculation_jdn, target_jdn, context.gates, context.stones, token);
    } catch (const Cancelled&) {
        throw;
    } catch (const std::exception& e) {
        const std::string message = e.what();
        if (message == "no anchor candidates in gate corpus") {
            throw std::out_of_range(message);
        }
        if (message == "no previous year in gate corpus" ||
            message == "no next year in gate corpus" ||
            message == "day beyond bidirectional gate corpus" ||
            message == "gate index") {
            throw std::range_error(message);
        }
        throw;
    }
    auto records = compute_segment(
        calculation_jdn, target_jdn, target_jdn,
        context.gates, context.stones, year, context.params);
    if (cancelled(token)) throw Cancelled{};
    if (records.size() != 1) throw std::runtime_error("mobile query record count mismatch");
    return to_c_record(records.front());
}

static seer_mobile_status translate_exception(
    const std::exception& e,
    seer_mobile_error* error) {
    if (dynamic_cast<const Cancelled*>(&e) || std::string(e.what()) == "seer cancelled") {
        set_error(error, SEER_MOBILE_CANCELLED, "cancelled");
        return SEER_MOBILE_CANCELLED;
    }
    if (dynamic_cast<const std::out_of_range*>(&e)) {
        set_error(error, SEER_MOBILE_CALCULATION_OUT_OF_DOMAIN, e.what());
        return SEER_MOBILE_CALCULATION_OUT_OF_DOMAIN;
    }
    if (dynamic_cast<const std::range_error*>(&e)) {
        set_error(error, SEER_MOBILE_TARGET_OUT_OF_DOMAIN, e.what());
        return SEER_MOBILE_TARGET_OUT_OF_DOMAIN;
    }
    set_error(error, SEER_MOBILE_INTERNAL_ERROR, e.what());
    return SEER_MOBILE_INTERNAL_ERROR;
}

static seer_mobile_status acquire_or_error(
    SlotGuard& slot,
    seer_mobile_error* error) {
    if (slot.result() == SlotResult::acquired) return SEER_MOBILE_OK;
    if (slot.result() == SlotResult::cancelled) {
        set_error(error, SEER_MOBILE_CANCELLED, "cancelled while queued");
        return SEER_MOBILE_CANCELLED;
    }
    set_error(error, SEER_MOBILE_QUEUE_FULL, "native work queue is full");
    return SEER_MOBILE_QUEUE_FULL;
}

} // namespace

extern "C" {

seer_mobile_status seer_mobile_create(
    const seer_mobile_config* config,
    seer_mobile_context** out_context,
    seer_mobile_error* error) {
    clear_error(error);
    if (!config || !out_context || config->struct_size != sizeof(seer_mobile_config) ||
        !config->positive_gate_path || !config->negative_gate_path) {
        set_error(error, SEER_MOBILE_INVALID_ARGUMENT, "invalid create arguments");
        return SEER_MOBILE_INVALID_ARGUMENT;
    }
    *out_context = nullptr;
    try {
        *out_context = new seer_mobile_context(*config);
        return SEER_MOBILE_OK;
    } catch (const std::exception& e) {
        set_error(error, SEER_MOBILE_INTERNAL_ERROR, e.what());
        return SEER_MOBILE_INTERNAL_ERROR;
    } catch (...) {
        set_error(error, SEER_MOBILE_INTERNAL_ERROR, "unknown native create failure");
        return SEER_MOBILE_INTERNAL_ERROR;
    }
}

void seer_mobile_context_retain(seer_mobile_context* context) {
    if (context) context->refs.fetch_add(1, std::memory_order_relaxed);
}

void seer_mobile_destroy(seer_mobile_context* context) {
    if (!context) return;
    if (context->refs.fetch_sub(1, std::memory_order_acq_rel) == 1) {
        delete context;
    }
}

seer_mobile_status seer_mobile_cancel_token_create(
    seer_mobile_cancel_token** out_token,
    seer_mobile_error* error) {
    clear_error(error);
    if (!out_token) {
        set_error(error, SEER_MOBILE_INVALID_ARGUMENT, "out_token is null");
        return SEER_MOBILE_INVALID_ARGUMENT;
    }
    *out_token = new (std::nothrow) seer_mobile_cancel_token();
    if (!*out_token) {
        set_error(error, SEER_MOBILE_INTERNAL_ERROR, "cancel token allocation failed");
        return SEER_MOBILE_INTERNAL_ERROR;
    }
    return SEER_MOBILE_OK;
}

void seer_mobile_cancel_token_retain(seer_mobile_cancel_token* token) {
    if (token) token->refs.fetch_add(1, std::memory_order_relaxed);
}

void seer_mobile_cancel_token_destroy(seer_mobile_cancel_token* token) {
    if (!token) return;
    if (token->refs.fetch_sub(1, std::memory_order_acq_rel) == 1) {
        delete token;
    }
}

void seer_mobile_cancel(seer_mobile_cancel_token* token) {
    if (token) token->cancelled.store(true, std::memory_order_relaxed);
}

void seer_mobile_cancel_token_reset(seer_mobile_cancel_token* token) {
    if (token) token->cancelled.store(false, std::memory_order_relaxed);
}

seer_mobile_status seer_mobile_query(
    seer_mobile_context* context,
    int64_t calculation_jdn,
    int64_t target_jdn,
    const seer_mobile_cancel_token* cancel_token,
    seer_mobile_record* out_record,
    seer_mobile_error* error) {
    clear_error(error);
    if (!context || !out_record) {
        set_error(error, SEER_MOBILE_INVALID_ARGUMENT, "context/out_record is null");
        return SEER_MOBILE_INVALID_ARGUMENT;
    }
    SlotGuard slot(*context, cancel_token);
    const auto acquired = acquire_or_error(slot, error);
    if (acquired != SEER_MOBILE_OK) return acquired;
    CancelScope cancel_scope(cancel_token);
    try {
        *out_record = compute_one(*context, calculation_jdn, target_jdn, cancel_token);
        return SEER_MOBILE_OK;
    } catch (const std::exception& e) {
        return translate_exception(e, error);
    } catch (...) {
        set_error(error, SEER_MOBILE_INTERNAL_ERROR, "unknown native query failure");
        return SEER_MOBILE_INTERNAL_ERROR;
    }
}

seer_mobile_status seer_mobile_query_batch(
    seer_mobile_context* context,
    int64_t calculation_jdn,
    const int64_t* target_jdns,
    size_t target_count,
    const seer_mobile_cancel_token* cancel_token,
    seer_mobile_record* out_records,
    seer_mobile_error* error) {
    clear_error(error);
    if (!context || !target_jdns || !out_records || target_count == 0 || target_count > 4096) {
        set_error(error, SEER_MOBILE_INVALID_ARGUMENT, "invalid batch arguments");
        return SEER_MOBILE_INVALID_ARGUMENT;
    }
    SlotGuard slot(*context, cancel_token);
    const auto acquired = acquire_or_error(slot, error);
    if (acquired != SEER_MOBILE_OK) return acquired;
    CancelScope cancel_scope(cancel_token);
    try {
        for (size_t i = 0; i < target_count; ++i) {
            if (cancelled(cancel_token)) throw Cancelled{};
            out_records[i] = compute_one(*context, calculation_jdn, target_jdns[i], cancel_token);
        }
        return SEER_MOBILE_OK;
    } catch (const std::exception& e) {
        return translate_exception(e, error);
    } catch (...) {
        set_error(error, SEER_MOBILE_INTERNAL_ERROR, "unknown native batch failure");
        return SEER_MOBILE_INTERNAL_ERROR;
    }
}

seer_mobile_status seer_mobile_get_provenance(
    const seer_mobile_context* context,
    seer_mobile_provenance* out_provenance,
    seer_mobile_error* error) {
    clear_error(error);
    if (!context || !out_provenance || out_provenance->struct_size != sizeof(seer_mobile_provenance)) {
        set_error(error, SEER_MOBILE_INVALID_ARGUMENT, "invalid provenance arguments");
        return SEER_MOBILE_INVALID_ARGUMENT;
    }
    out_provenance->abi_version = SEER_MOBILE_ABI_VERSION;
    copy_identity(out_provenance->package_version, SEER_PACKAGE_VERSION);
    copy_identity(out_provenance->source_commit, SEER_BUILD_COMMIT);
    copy_identity(out_provenance->backend, "portable-cppint");
    return SEER_MOBILE_OK;
}

} // extern "C"
