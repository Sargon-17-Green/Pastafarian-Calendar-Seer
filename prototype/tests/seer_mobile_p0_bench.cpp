#include "seer_mobile.h"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
#include <sys/resource.h>

using Clock = std::chrono::steady_clock;
static double millis(Clock::time_point a, Clock::time_point b) {
    return std::chrono::duration<double, std::milli>(b-a).count();
}
static bool equal_record(const seer_mobile_record& a, const seer_mobile_record& b) {
    return a.target_jdn==b.target_jdn && a.year==b.year &&
      a.cutlet_index==b.cutlet_index && a.day_in_cutlet==b.day_in_cutlet &&
      a.month_index==b.month_index && a.day_in_month==b.day_in_month &&
      a.cutlet_count==b.cutlet_count && a.month_count==b.month_count;
}
static void fail(const char* operation, seer_mobile_status s, const seer_mobile_error& e) {
    std::cerr << "P0_ERROR operation=" << operation << " status=" << int(s)
              << " message=" << e.message << "\n";
    std::exit(3);
}
static void print_samples(const char* scenario, const std::vector<double>& samples,
                          int size, long maxrss) {
    auto sorted=samples; std::sort(sorted.begin(),sorted.end());
    const double p50=sorted.size()%2 ? sorted[sorted.size()/2] :
      (sorted[sorted.size()/2-1]+sorted[sorted.size()/2])/2.0;
    const size_t i95=(95 * sorted.size() + 99) / 100 - 1;
    std::cout << std::fixed << std::setprecision(3)
              << "{\"event\":\"P0_SAMPLE\",\"scenario\":\"" << scenario
              << "\",\"count\":" << size << ",\"timesMs\":[";
    for(size_t i=0;i<samples.size();i++) {
        if(i) std::cout << ",";
        std::cout << samples[i];
    }
    std::cout << "],\"p50Ms\":" << p50 << ",\"p95NearestRankMs\":"
              << sorted[i95] << ",\"maxRssKb\":" << maxrss << "}" << std::endl;
}
int main(int argc, char** argv) {
    if(argc < 3 || argc > 4) {
        std::cerr << "usage: seer_mobile_p0_bench POSITIVE_GATES NEGATIVE_GATES [reps=3]\n";
        return 2;
    }
    const int reps = argc==4 ? std::atoi(argv[3]) : 3;
    if(reps<1 || reps>60) { std::cerr << "reps must be 1..60\n"; return 2; }
    seer_mobile_config config{};
    config.struct_size=sizeof(config);
    config.max_concurrent=2; config.max_queued=8;
    config.weave_threads=1; config.superblock=512; config.replay_threads=1;
    config.positive_gate_path=argv[1]; config.negative_gate_path=argv[2];
    seer_mobile_context* context=nullptr;
    seer_mobile_error error{};
    auto start=Clock::now();
    auto status=seer_mobile_create(&config,&context,&error);
    auto end=Clock::now();
    if(status!=SEER_MOBILE_OK) fail("create",status,error);
    seer_mobile_provenance identity{}; identity.struct_size=sizeof(identity);
    status=seer_mobile_get_provenance(context,&identity,&error);
    if(status!=SEER_MOBILE_OK) fail("provenance",status,error);
    std::cout << std::fixed << std::setprecision(3)
              << "{\"event\":\"P0_IDENTITY\",\"abi\":" << identity.abi_version
              << ",\"version\":\"" << identity.package_version
              << "\",\"commit\":\"" << identity.source_commit
              << "\",\"backend\":\"" << identity.backend
              << "\",\"contextCreateMs\":" << millis(start,end)
              << ",\"reps\":" << reps << "}" << std::endl;

    constexpr int64_t calculation=2461290LL;
    for(int count : {1,7,42}) {
        std::vector<int64_t> dates(count);
        for(int i=0;i<count;i++) dates[i]=calculation - count/2 + i;
        std::vector<seer_mobile_record> output(count);
        std::vector<double> samples;
        for(int trial=-1;trial<reps;trial++) {
            const auto t0=Clock::now();
            if(count==1) {
                status=seer_mobile_query(context,calculation,dates[0],nullptr,&output[0],&error);
            } else {
                status=seer_mobile_query_batch(context,calculation,dates.data(),dates.size(),nullptr,output.data(),&error);
            }
            const auto t1=Clock::now();
            if(status!=SEER_MOBILE_OK) fail(count==1?"query":"batch",status,error);
            if(trial>=0) samples.push_back(millis(t0,t1));
        }
        seer_mobile_record check{};
        status=seer_mobile_query(context,calculation,dates.front(),nullptr,&check,&error);
        if(status!=SEER_MOBILE_OK) fail("check_first",status,error);
        if(!equal_record(check,output.front())) {
            std::cerr << "P0_ERROR batch_first_mismatch\n"; return 4;
        }
        status=seer_mobile_query(context,calculation,dates.back(),nullptr,&check,&error);
        if(status!=SEER_MOBILE_OK) fail("check_last",status,error);
        if(!equal_record(check,output.back())) {
            std::cerr << "P0_ERROR batch_last_mismatch\n"; return 4;
        }
        struct rusage usage{};
        getrusage(RUSAGE_SELF,&usage);
        print_samples(count==1?"single":count==7?"batch7":"batch42",
                      samples,count,usage.ru_maxrss);
    }
    seer_mobile_destroy(context);
    std::cout << "{\"event\":\"P0_COMPLETE\",\"validNativeBatchEndpoints\":true}" << std::endl;
    return 0;
}
