#include "../include/seer_mobile.h"
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data,size_t size){
    static seer_mobile_context* ctx=[]{
        const char* pos=std::getenv("SEER_MOBILE_POSITIVE_GATES");
        const char* neg=std::getenv("SEER_MOBILE_NEGATIVE_GATES");
        if(!pos||!neg)return (seer_mobile_context*)nullptr;
        seer_mobile_config cfg{};
        cfg.struct_size=sizeof(cfg);cfg.max_concurrent=1;cfg.max_queued=0;
        cfg.weave_threads=1;cfg.superblock=64;cfg.replay_threads=1;
        cfg.positive_gate_path=pos;cfg.negative_gate_path=neg;
        seer_mobile_error err{};seer_mobile_context* out=nullptr;
        return seer_mobile_create(&cfg,&out,&err)==SEER_MOBILE_OK?out:nullptr;
    }();
    if(!ctx||size<16)return 0;
    int64_t calc=0,target=0;
    std::memcpy(&calc,data,8);std::memcpy(&target,data+8,8);
    seer_mobile_record out{};seer_mobile_error err{};
    seer_mobile_cancel_token* token=nullptr;
    if(size>16 && (data[16]&1)){
        if(seer_mobile_cancel_token_create(&token,&err)==SEER_MOBILE_OK && (data[16]&2)) seer_mobile_cancel(token);
    }
    (void)seer_mobile_query(ctx,calc,target,token,&out,&err);
    seer_mobile_cancel_token_destroy(token);
    return 0;
}
