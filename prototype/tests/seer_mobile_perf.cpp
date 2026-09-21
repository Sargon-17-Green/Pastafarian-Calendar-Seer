#include "../include/seer_mobile.h"

#include <algorithm>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <vector>

using Clock = std::chrono::steady_clock;
static double elapsed_ms(Clock::time_point a, Clock::time_point b) {
    return std::chrono::duration<double, std::milli>(b-a).count();
}

int main(int argc,char**argv){
    if(argc!=3){std::cerr<<"usage: perf POS NEG\n";return 2;}
    seer_mobile_config cfg{};
    cfg.struct_size=sizeof(cfg);cfg.max_concurrent=2;cfg.max_queued=8;
    cfg.weave_threads=1;cfg.superblock=512;cfg.replay_threads=1;
    cfg.positive_gate_path=argv[1];cfg.negative_gate_path=argv[2];

    seer_mobile_error error{};seer_mobile_context* ctx=nullptr;
    auto a=Clock::now();
    auto status=seer_mobile_create(&cfg,&ctx,&error);
    auto b=Clock::now();
    if(status!=SEER_MOBILE_OK){std::cerr<<error.message<<"\n";return 3;}
    const double createMs=elapsed_ms(a,b);

    seer_mobile_record record{};
    status=seer_mobile_query(ctx,2461290LL,2461290LL,nullptr,&record,&error);
    if(status!=SEER_MOBILE_OK){std::cerr<<error.message<<"\n";return 4;}

    std::vector<double> samples;
    for(int i=0;i<5;i++){
        auto q0=Clock::now();
        status=seer_mobile_query(ctx,2461290LL,2461290LL,nullptr,&record,&error);
        auto q1=Clock::now();
        if(status!=SEER_MOBILE_OK){std::cerr<<error.message<<"\n";return 5;}
        samples.push_back(elapsed_ms(q0,q1));
    }
    std::sort(samples.begin(),samples.end());
    const double p50=samples[samples.size()/2];

    int64_t targets[8]{};
    seer_mobile_record records[8]{};
    for(int i=0;i<8;i++)targets[i]=2461287LL+i;
    auto r0=Clock::now();
    status=seer_mobile_query_batch(ctx,2461290LL,targets,8,nullptr,records,&error);
    auto r1=Clock::now();
    if(status!=SEER_MOBILE_OK){std::cerr<<error.message<<"\n";return 6;}
    const double batchMs=elapsed_ms(r0,r1);

    seer_mobile_provenance provenance{};provenance.struct_size=sizeof(provenance);
    if(seer_mobile_get_provenance(ctx,&provenance,&error)!=SEER_MOBILE_OK)return 7;
    std::cout<<std::fixed<<std::setprecision(3)
      <<"{\"event\":\"SEER_MOBILE_PERF\",\"backend\":\""<<provenance.backend
      <<"\",\"sourceCommit\":\""<<provenance.source_commit
      <<"\",\"createMs\":"<<createMs
      <<",\"queryWarmP50Ms\":"<<p50
      <<",\"batch8Ms\":"<<batchMs
      <<",\"batch8PerRecordMs\":"<<(batchMs/8.0)<<"}\n";
    seer_mobile_destroy(ctx);
    return 0;
}
