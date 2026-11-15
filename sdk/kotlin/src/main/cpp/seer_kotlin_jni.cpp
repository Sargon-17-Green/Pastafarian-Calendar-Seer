// ABI-v1 JVM/Android JNI adapter. Calendar computations are NEVER
// implemented here; they are delegated exclusively to seer_mobile.h.
#include <jni.h>
#include "seer_mobile.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>

namespace {
constexpr int kRecordWidth = 8;
constexpr jsize kMaxBatch = 4096;

seer_mobile_context* context(jlong handle) {
    return reinterpret_cast<seer_mobile_context*>(static_cast<uintptr_t>(handle));
}

seer_mobile_cancel_token* token(jlong handle) {
    return reinterpret_cast<seer_mobile_cancel_token*>(static_cast<uintptr_t>(handle));
}

jlong handle_of(const void* pointer) {
    return static_cast<jlong>(reinterpret_cast<uintptr_t>(pointer));
}

void append_record(jlong* output, const seer_mobile_record& record) {
    output[0] = static_cast<jlong>(record.target_jdn);
    output[1] = static_cast<jlong>(record.year);
    output[2] = static_cast<jlong>(record.cutlet_index);
    output[3] = static_cast<jlong>(record.day_in_cutlet);
    output[4] = static_cast<jlong>(record.month_index);
    output[5] = static_cast<jlong>(record.day_in_month);
    output[6] = static_cast<jlong>(record.cutlet_count);
    output[7] = static_cast<jlong>(record.month_count);
}

jlongArray status_only(JNIEnv* env, seer_mobile_status status) {
    const jlong value = static_cast<jlong>(status);
    jlongArray result = env->NewLongArray(1);
    if (result) env->SetLongArrayRegion(result, 0, 1, &value);
    return result;
}

jlongArray make_records(
    JNIEnv* env,
    const seer_mobile_record* records,
    jsize count) {
    const jsize length = 1 + count * kRecordWidth;
    jlongArray result = env->NewLongArray(length);
    if (!result) return nullptr;
    // Success marker is zero; a Java new long[] is already zero initialized.
    jlong* buffer = static_cast<jlong*>(
        std::malloc(static_cast<size_t>(length) * sizeof(jlong)));
    if (!buffer) return status_only(env, SEER_MOBILE_INTERNAL_ERROR);
    buffer[0] = SEER_MOBILE_OK;
    for (jsize index = 0; index < count; ++index) {
        append_record(buffer + 1 + index * kRecordWidth, records[index]);
    }
    env->SetLongArrayRegion(result, 0, length, buffer);
    std::free(buffer);
    return result;
}

bool set_field(JNIEnv* env, jobjectArray array, jsize index, const char* value) {
    jstring str = env->NewStringUTF(value);
    if (!str) return false;
    env->SetObjectArrayElement(array, index, str);
    env->DeleteLocalRef(str);
    return !env->ExceptionCheck();
}
}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_create(
    JNIEnv* env, jobject, jstring positive, jstring negative,
    jint maxConcurrent, jint maxQueued) {
    if (!positive || !negative || maxConcurrent < 1 || maxQueued < 0) return 0;
    const char* pos = env->GetStringUTFChars(positive, nullptr);
    if (!pos) return 0;
    const char* neg = env->GetStringUTFChars(negative, nullptr);
    if (!neg) {
        env->ReleaseStringUTFChars(positive, pos);
        return 0;
    }

    seer_mobile_config cfg{};
    cfg.struct_size = sizeof(cfg);
    cfg.max_concurrent = static_cast<uint32_t>(maxConcurrent);
    cfg.max_queued = static_cast<uint32_t>(maxQueued);
    cfg.weave_threads = 1;
    cfg.superblock = 512;
    cfg.replay_threads = 1;
    cfg.positive_gate_path = pos;
    cfg.negative_gate_path = neg;

    seer_mobile_context* created = nullptr;
    seer_mobile_error error{};
    const auto status = seer_mobile_create(&cfg, &created, &error);
    env->ReleaseStringUTFChars(positive, pos);
    env->ReleaseStringUTFChars(negative, neg);
    if (status != SEER_MOBILE_OK) return 0;
    return handle_of(created);
}

extern "C" JNIEXPORT void JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_destroy(
    JNIEnv*, jobject, jlong nativeHandle) {
    seer_mobile_destroy(context(nativeHandle));
}

extern "C" JNIEXPORT jlong JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_createCancel(
    JNIEnv*, jobject) {
    seer_mobile_cancel_token* created = nullptr;
    seer_mobile_error error{};
    return seer_mobile_cancel_token_create(&created, &error) == SEER_MOBILE_OK
        ? handle_of(created) : 0;
}

extern "C" JNIEXPORT void JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_retainCancel(
    JNIEnv*, jobject, jlong tokenHandle) {
    seer_mobile_cancel_token_retain(token(tokenHandle));
}

extern "C" JNIEXPORT void JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_destroyCancel(
    JNIEnv*, jobject, jlong tokenHandle) {
    seer_mobile_cancel_token_destroy(token(tokenHandle));
}

extern "C" JNIEXPORT void JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_cancel(
    JNIEnv*, jobject, jlong tokenHandle) {
    seer_mobile_cancel(token(tokenHandle));
}

extern "C" JNIEXPORT void JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_resetCancel(
    JNIEnv*, jobject, jlong tokenHandle) {
    seer_mobile_cancel_token_reset(token(tokenHandle));
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_query(
    JNIEnv* env, jobject, jlong nativeHandle,
    jlong calculationJdn, jlong targetJdn, jlong tokenHandle) {
    seer_mobile_record record{};
    seer_mobile_error error{};
    const auto status = seer_mobile_query(
        context(nativeHandle), static_cast<int64_t>(calculationJdn),
        static_cast<int64_t>(targetJdn), token(tokenHandle), &record, &error);
    if (status != SEER_MOBILE_OK) return status_only(env, status);
    return make_records(env, &record, 1);
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_queryBatch(
    JNIEnv* env, jobject, jlong nativeHandle,
    jlong calculationJdn, jlongArray requestedTargets, jlong tokenHandle) {
    if (!requestedTargets) return status_only(env, SEER_MOBILE_INVALID_ARGUMENT);
    const jsize count = env->GetArrayLength(requestedTargets);
    if (count <= 0 || count > kMaxBatch) {
        return status_only(env, SEER_MOBILE_INVALID_ARGUMENT);
    }

    // Do not alias JNI jlong buffers as int64_t*: on 64-bit Linux these may
    // be different C++ types (long long versus long), violating strict aliasing.
    auto* wire = static_cast<jlong*>(
        std::malloc(static_cast<size_t>(count) * sizeof(jlong)));
    auto* targets = static_cast<int64_t*>(
        std::malloc(static_cast<size_t>(count) * sizeof(int64_t)));
    auto* records = static_cast<seer_mobile_record*>(
        std::calloc(static_cast<size_t>(count), sizeof(seer_mobile_record)));
    if (!wire || !targets || !records) {
        std::free(wire);
        std::free(targets);
        std::free(records);
        return status_only(env, SEER_MOBILE_INTERNAL_ERROR);
    }

    env->GetLongArrayRegion(requestedTargets, 0, count, wire);
    if (env->ExceptionCheck()) {
        std::free(wire);
        std::free(targets);
        std::free(records);
        return nullptr;
    }
    for (jsize i = 0; i < count; ++i) {
        targets[i] = static_cast<int64_t>(wire[i]);
    }
    std::free(wire);

    seer_mobile_error error{};
    const auto status = seer_mobile_query_batch(
        context(nativeHandle), static_cast<int64_t>(calculationJdn),
        targets, static_cast<size_t>(count), token(tokenHandle), records, &error);
    std::free(targets);
    if (status != SEER_MOBILE_OK) {
        std::free(records);
        return status_only(env, status);
    }

    jlongArray result = make_records(env, records, count);
    std::free(records);
    return result;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_org_pastafarian_seer_kotlin_SeerKotlinJni_provenance(
    JNIEnv* env, jobject, jlong nativeHandle) {
    seer_mobile_provenance p{};
    p.struct_size = sizeof(p);
    seer_mobile_error error{};
    if (seer_mobile_get_provenance(
            context(nativeHandle), &p, &error) != SEER_MOBILE_OK) {
        return nullptr;
    }

    jclass strClass = env->FindClass("java/lang/String");
    if (!strClass) return nullptr;
    jobjectArray result = env->NewObjectArray(4, strClass, nullptr);
    env->DeleteLocalRef(strClass);
    if (!result) return nullptr;
    char version[16]{};
    std::snprintf(version, sizeof(version), "%u", p.abi_version);
    if (!set_field(env, result, 0, version) ||
        !set_field(env, result, 1, p.package_version) ||
        !set_field(env, result, 2, p.source_commit) ||
        !set_field(env, result, 3, p.backend)) {
        return nullptr;
    }
    return result;
}
