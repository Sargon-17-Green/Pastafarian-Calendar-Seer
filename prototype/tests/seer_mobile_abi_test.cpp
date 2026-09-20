#include "../include/seer_mobile.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <thread>
#include <vector>

static seer_mobile_config config(const char* pos,const char* neg){
    seer_mobile_config c{};
    c.struct_size=sizeof(c);
    c.max_concurrent=1;
    c.max_queued=1;
    c.weave_threads=1;
    c.superblock=64;
    c.replay_threads=1;
    c.positive_gate_path=pos;
    c.negative_gate_path=neg;
    return c;
}

int main(int argc,char**argv){
    if(argc!=3){std::cerr<<"usage: test POS NEG\n";return 2;}
    seer_mobile_error err{};
    seer_mobile_context* ctx=nullptr;
    auto c=config(argv[1],argv[2]);
    assert(seer_mobile_create(&c,&ctx,&err)==SEER_MOBILE_OK);
    assert(ctx);
    seer_mobile_context_retain(ctx);
    seer_mobile_destroy(ctx); // release caller ownership; retained call ref remains valid

    seer_mobile_provenance p{};
    p.struct_size=sizeof(p);
    assert(seer_mobile_get_provenance(ctx,&p,&err)==SEER_MOBILE_OK);
    assert(p.abi_version==SEER_MOBILE_ABI_VERSION);
    assert(std::strlen(p.backend)>0);

    seer_mobile_record foundation{};
    assert(seer_mobile_query(ctx,-13334246LL,-13334246LL,nullptr,&foundation,&err)==SEER_MOBILE_OK);
    assert(foundation.target_jdn==-13334246LL);
    assert(foundation.year!=0);
    assert(foundation.cutlet_count>=5 && foundation.cutlet_count<=17);
    assert(foundation.month_count>=1 && foundation.month_count<=47);

    const int64_t targets[3]={-13334246LL,-13334245LL,-13334244LL};
    seer_mobile_record batch[3]{};
    assert(seer_mobile_query_batch(ctx,-13334246LL,targets,3,nullptr,batch,&err)==SEER_MOBILE_OK);
    for(int i=0;i<3;i++) assert(batch[i].target_jdn==targets[i]);

    seer_mobile_cancel_token* token=nullptr;
    assert(seer_mobile_cancel_token_create(&token,&err)==SEER_MOBILE_OK);
    seer_mobile_cancel_token_retain(token);
    seer_mobile_cancel_token_destroy(token); // release caller ownership; retained call ref remains valid
    seer_mobile_cancel(token);
    seer_mobile_record cancelled{};
    assert(seer_mobile_query(ctx,-13334246LL,-13334246LL,token,&cancelled,&err)==SEER_MOBILE_CANCELLED);
    seer_mobile_cancel_token_reset(token);

    std::atomic<int> ready{0};
    std::atomic<int> go{0};
    seer_mobile_status s1=SEER_MOBILE_INTERNAL_ERROR,s2=SEER_MOBILE_INTERNAL_ERROR,s3=SEER_MOBILE_INTERNAL_ERROR;
    seer_mobile_record r1{},r2{},r3{};
    auto worker=[&](seer_mobile_status* status,seer_mobile_record* record,int64_t target){
        ready.fetch_add(1);
        while(!go.load()) std::this_thread::yield();
        seer_mobile_error local{};
        *status=seer_mobile_query(ctx,-13334246LL,target,nullptr,record,&local);
    };
    std::thread t1(worker,&s1,&r1,-13330000LL);
    std::thread t2(worker,&s2,&r2,-13330001LL);
    while(ready.load()<2) std::this_thread::yield();
    go.store(1);
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
    seer_mobile_error local{};
    s3=seer_mobile_query(ctx,-13334246LL,-13330002LL,nullptr,&r3,&local);
    t1.join();t2.join();
    assert((s1==SEER_MOBILE_OK || s1==SEER_MOBILE_QUEUE_FULL));
    assert((s2==SEER_MOBILE_OK || s2==SEER_MOBILE_QUEUE_FULL));
    assert((s3==SEER_MOBILE_OK || s3==SEER_MOBILE_QUEUE_FULL));
    assert(s1==SEER_MOBILE_QUEUE_FULL || s2==SEER_MOBILE_QUEUE_FULL || s3==SEER_MOBILE_QUEUE_FULL);

    assert(seer_mobile_query(ctx,std::numeric_limits<int64_t>::min(),-13334246LL,nullptr,&r1,&err)==SEER_MOBILE_CALCULATION_OUT_OF_DOMAIN);
    assert(seer_mobile_query(ctx,-13334246LL,std::numeric_limits<int64_t>::min(),nullptr,&r1,&err)==SEER_MOBILE_TARGET_OUT_OF_DOMAIN);
    assert(seer_mobile_query(nullptr,0,0,nullptr,&r1,&err)==SEER_MOBILE_INVALID_ARGUMENT);

    seer_mobile_cancel_token_destroy(token);
    seer_mobile_destroy(ctx);
    std::cout<<"SEER_MOBILE_ABI_TEST_PASS\n";
    return 0;
}
