#include "../include/seer_mobile.h"
#include <cstdlib>
#include <iostream>
#include <vector>

int main(int argc,char**argv){
    if(argc!=6){std::cerr<<"usage: dump POS NEG CALC START COUNT\n";return 2;}
    const int64_t calc=std::stoll(argv[3]), start=std::stoll(argv[4]);
    const size_t count=static_cast<size_t>(std::stoull(argv[5]));
    seer_mobile_config cfg{};
    cfg.struct_size=sizeof(cfg);cfg.max_concurrent=2;cfg.max_queued=8;
    cfg.weave_threads=1;cfg.superblock=512;cfg.replay_threads=1;
    cfg.positive_gate_path=argv[1];cfg.negative_gate_path=argv[2];
    seer_mobile_error err{};seer_mobile_context* ctx=nullptr;
    auto status=seer_mobile_create(&cfg,&ctx,&err);
    if(status!=SEER_MOBILE_OK){std::cerr<<err.message<<"\n";return 3;}
    std::vector<int64_t> targets(count);std::vector<seer_mobile_record> records(count);
    for(size_t i=0;i<count;i++)targets[i]=start+static_cast<int64_t>(i);
    status=seer_mobile_query_batch(ctx,calc,targets.data(),targets.size(),nullptr,records.data(),&err);
    if(status!=SEER_MOBILE_OK){std::cerr<<err.message<<"\n";seer_mobile_destroy(ctx);return 4;}
    std::cout<<"{\"schema\":1,\"calcJdn\":"<<calc<<",\"targetStartJdn\":"<<start
             <<",\"targetCount\":"<<count<<",\"records\":[";
    for(size_t i=0;i<records.size();i++){
        if(i)std::cout<<',';
        const auto&r=records[i];
        std::cout<<"{\"targetJdn\":"<<r.target_jdn<<",\"year\":"<<r.year
                 <<",\"cutletIndex\":"<<r.cutlet_index<<",\"dayInCutlet\":"<<r.day_in_cutlet
                 <<",\"monthIndex\":"<<r.month_index<<",\"dayInMonth\":"<<r.day_in_month
                 <<",\"cutletCount\":"<<r.cutlet_count<<",\"monthCount\":"<<r.month_count<<"}";
    }
    std::cout<<"]}\n";
    seer_mobile_destroy(ctx);
    return 0;
}
