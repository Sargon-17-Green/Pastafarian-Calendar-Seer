// Portable C ABI acceptance executable. Runs on an Android ARM64 phone
// with adb shell, no APK installation, Java, root or network needed.
#include "seer_mobile.h"
#include <cinttypes>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>

static bool same(const seer_mobile_record& a, const seer_mobile_record& b) {
    return a.target_jdn == b.target_jdn && a.year == b.year &&
        a.cutlet_index == b.cutlet_index && a.day_in_cutlet == b.day_in_cutlet &&
        a.month_index == b.month_index && a.day_in_month == b.day_in_month &&
        a.cutlet_count == b.cutlet_count && a.month_count == b.month_count;
}
static int fail(const char* stage, seer_mobile_status got,
                const seer_mobile_error& error) {
    std::printf("SEER_ARM64_DEVICE_FAIL stage=%s status=%d message=%s\n",
                stage, static_cast<int>(got), error.message);
    return 1;
}
static bool fields(const seer_mobile_record& actual, int64_t target,
                   int64_t year, int32_t cutlet, int32_t cutlet_day,
                   int32_t month, int32_t month_day, int32_t months) {
    return actual.target_jdn == target && actual.year == year &&
        actual.cutlet_index == cutlet && actual.day_in_cutlet == cutlet_day &&
        actual.month_index == month && actual.day_in_month == month_day &&
        actual.month_count == months && actual.cutlet_count >= 5 &&
        actual.cutlet_count <= 17;
}

int main(int argc, char** argv) {
    static_assert(SEER_MOBILE_ABI_VERSION == 1u);
    if (argc != 4 || !argv[1] || !argv[2] || !argv[3] ||
        std::strlen(argv[3]) != 40) {
        std::puts("SEER_ARM64_DEVICE_FAIL stage=arguments expected=positive,negative,commit");
        return 2;
    }
    seer_mobile_config cfg{};
    cfg.struct_size = sizeof(cfg);
    cfg.max_concurrent = 2;
    cfg.max_queued = 8;
    cfg.weave_threads = 1;
    cfg.superblock = 512;
    cfg.replay_threads = 1;
    cfg.positive_gate_path = argv[1];
    cfg.negative_gate_path = argv[2];
    seer_mobile_error err{};
    seer_mobile_context* context = nullptr;
    auto st = seer_mobile_create(&cfg, &context, &err);
    if (st != SEER_MOBILE_OK || !context) return fail("create", st, err);

    seer_mobile_provenance prov{};
    prov.struct_size = sizeof(prov);
    st = seer_mobile_get_provenance(context, &prov, &err);
    if (st != SEER_MOBILE_OK || prov.abi_version != 1u ||
        std::strcmp(prov.source_commit, argv[3]) != 0 ||
        std::strcmp(prov.package_version, "0.2.5") != 0 ||
        std::strcmp(prov.backend, "portable-cppint") != 0) {
        seer_mobile_destroy(context);
        return fail("provenance", st, err);
    }

    const int64_t calc = 2461290;
    const int64_t targets[3] = {2458961, 2461290, 2463008};
    seer_mobile_record individuals[3]{};
    for (int i = 0; i < 3; ++i) {
        st = seer_mobile_query(context, calc, targets[i], nullptr,
                               &individuals[i], &err);
        if (st != SEER_MOBILE_OK) {
            seer_mobile_destroy(context);
            return fail("known", st, err);
        }
    }
    if (!fields(individuals[0], targets[0], 5000, 5, 1, 5, 1, 37) ||
        !fields(individuals[1], targets[1], 5000, 14, 337, 39, 69, 37) ||
        !fields(individuals[2], targets[2], 5001, 1, 1, 46, 1, 27)) {
        seer_mobile_destroy(context);
        return fail("known-fields", SEER_MOBILE_INTERNAL_ERROR, err);
    }
    seer_mobile_record batch[3]{};
    st = seer_mobile_query_batch(context, calc, targets, 3, nullptr, batch, &err);
    if (st != SEER_MOBILE_OK || !same(batch[0], individuals[0]) ||
        !same(batch[1], individuals[1]) || !same(batch[2], individuals[2])) {
        seer_mobile_destroy(context);
        return fail("batch", st, err);
    }

    const int64_t neg_calc = -13334246;
    const int64_t neg_targets[3] = {-13334246, -13334245, -13334244};
    seer_mobile_record neg_batch[3]{};
    st = seer_mobile_query_batch(context, neg_calc, neg_targets, 3,
                                 nullptr, neg_batch, &err);
    if (st != SEER_MOBILE_OK) {
        seer_mobile_destroy(context);
        return fail("negative-batch", st, err);
    }
    for (int i = 0; i < 3; ++i) {
        seer_mobile_record row{};
        st = seer_mobile_query(context, neg_calc, neg_targets[i], nullptr,
                               &row, &err);
        if (st != SEER_MOBILE_OK || !same(row, neg_batch[i])) {
            seer_mobile_destroy(context);
            return fail("negative-single", st, err);
        }
    }

    seer_mobile_record invalid{};
    st = seer_mobile_query(context, INT64_MIN, neg_calc, nullptr, &invalid, &err);
    if (st != SEER_MOBILE_CALCULATION_OUT_OF_DOMAIN) {
        seer_mobile_destroy(context);
        return fail("calculation-domain", st, err);
    }
    st = seer_mobile_query(context, neg_calc, INT64_MIN, nullptr, &invalid, &err);
    if (st != SEER_MOBILE_TARGET_OUT_OF_DOMAIN) {
        seer_mobile_destroy(context);
        return fail("target-domain", st, err);
    }
    st = seer_mobile_query(context, neg_calc, neg_calc, nullptr, &invalid, &err);
    if (st != SEER_MOBILE_OK || !same(invalid, neg_batch[0])) {
        seer_mobile_destroy(context);
        return fail("domain-recovery", st, err);
    }

    seer_mobile_cancel_token* token = nullptr;
    st = seer_mobile_cancel_token_create(&token, &err);
    if (st != SEER_MOBILE_OK || !token) {
        seer_mobile_destroy(context);
        return fail("token-create", st, err);
    }
    seer_mobile_cancel(token);
    st = seer_mobile_query(context, neg_calc, neg_calc, token, &invalid, &err);
    if (st != SEER_MOBILE_CANCELLED) {
        seer_mobile_cancel_token_destroy(token);
        seer_mobile_destroy(context);
        return fail("token-cancel", st, err);
    }
    seer_mobile_cancel_token_reset(token);
    st = seer_mobile_query(context, neg_calc, neg_calc, token, &invalid, &err);
    if (st != SEER_MOBILE_OK || !same(invalid, neg_batch[0])) {
        seer_mobile_cancel_token_destroy(token);
        seer_mobile_destroy(context);
        return fail("token-reset", st, err);
    }
    seer_mobile_cancel_token_destroy(token);
    seer_mobile_destroy(context);
    std::printf("SEER_ARM64_ANDROID_NATIVE_PASS abi=1 source=%s "
                "knownAnswers=3 negativeBatch=3 exactParity=true "
                "domainErrors=true cancellation=true lifecycle=true\n", argv[3]);
    return 0;
}
