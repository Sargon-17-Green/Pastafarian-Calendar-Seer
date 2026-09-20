#pragma once

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
  #if defined(SEER_MOBILE_BUILD_DLL)
    #define SEER_MOBILE_API __declspec(dllexport)
  #elif defined(SEER_MOBILE_USE_DLL)
    #define SEER_MOBILE_API __declspec(dllimport)
  #else
    #define SEER_MOBILE_API
  #endif
#else
  #define SEER_MOBILE_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define SEER_MOBILE_ABI_VERSION 1u
#define SEER_MOBILE_ERROR_MESSAGE_CAPACITY 192u
#define SEER_MOBILE_IDENTITY_CAPACITY 64u

typedef struct seer_mobile_context seer_mobile_context;
typedef struct seer_mobile_cancel_token seer_mobile_cancel_token;

typedef enum seer_mobile_status {
    SEER_MOBILE_OK = 0,
    SEER_MOBILE_INVALID_ARGUMENT = 1,
    SEER_MOBILE_CALCULATION_OUT_OF_DOMAIN = 2,
    SEER_MOBILE_TARGET_OUT_OF_DOMAIN = 3,
    SEER_MOBILE_CANCELLED = 4,
    SEER_MOBILE_QUEUE_FULL = 5,
    SEER_MOBILE_INTERNAL_ERROR = 6
} seer_mobile_status;

typedef struct seer_mobile_error {
    uint32_t struct_size;
    int32_t status;
    char message[SEER_MOBILE_ERROR_MESSAGE_CAPACITY];
} seer_mobile_error;

typedef struct seer_mobile_config {
    uint32_t struct_size;
    uint32_t max_concurrent;
    uint32_t max_queued;
    int32_t weave_threads;
    int32_t superblock;
    int32_t replay_threads;
    const char* positive_gate_path;
    const char* negative_gate_path;
} seer_mobile_config;

typedef struct seer_mobile_record {
    int64_t target_jdn;
    int64_t year;
    int32_t cutlet_index;
    int32_t day_in_cutlet;
    int32_t month_index;
    int32_t day_in_month;
    int32_t cutlet_count;
    int32_t month_count;
} seer_mobile_record;

typedef struct seer_mobile_provenance {
    uint32_t struct_size;
    uint32_t abi_version;
    char package_version[SEER_MOBILE_IDENTITY_CAPACITY];
    char source_commit[SEER_MOBILE_IDENTITY_CAPACITY];
    char backend[SEER_MOBILE_IDENTITY_CAPACITY];
} seer_mobile_provenance;

SEER_MOBILE_API seer_mobile_status seer_mobile_create(
    const seer_mobile_config* config,
    seer_mobile_context** out_context,
    seer_mobile_error* error);

SEER_MOBILE_API void seer_mobile_destroy(seer_mobile_context* context);

SEER_MOBILE_API seer_mobile_status seer_mobile_cancel_token_create(
    seer_mobile_cancel_token** out_token,
    seer_mobile_error* error);
SEER_MOBILE_API void seer_mobile_cancel_token_destroy(seer_mobile_cancel_token* token);
SEER_MOBILE_API void seer_mobile_cancel(seer_mobile_cancel_token* token);
SEER_MOBILE_API void seer_mobile_cancel_token_reset(seer_mobile_cancel_token* token);

SEER_MOBILE_API seer_mobile_status seer_mobile_query(
    seer_mobile_context* context,
    int64_t calculation_jdn,
    int64_t target_jdn,
    const seer_mobile_cancel_token* cancel_token,
    seer_mobile_record* out_record,
    seer_mobile_error* error);

SEER_MOBILE_API seer_mobile_status seer_mobile_query_batch(
    seer_mobile_context* context,
    int64_t calculation_jdn,
    const int64_t* target_jdns,
    size_t target_count,
    const seer_mobile_cancel_token* cancel_token,
    seer_mobile_record* out_records,
    seer_mobile_error* error);

SEER_MOBILE_API seer_mobile_status seer_mobile_get_provenance(
    const seer_mobile_context* context,
    seer_mobile_provenance* out_provenance,
    seer_mobile_error* error);

#ifdef __cplusplus
}
#endif
