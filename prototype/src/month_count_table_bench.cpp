#define main seer_year_batch_embedded_main
#include "pastafarian_year_batch.cpp"
#undef main
#include <chrono>
#include <iostream>
using C=std::chrono::steady_clock;
static double elapsed(C::time_point a,C::time_point b){return std::chrono::duration<double,std::milli>(b-a).count();}
struct LegacyMonthDP{
    int total,parts;std::vector<std::vector<YBU320>>f;
    LegacyMonthDP(int T,int P):total(T),parts(P),f(P+1){
        f[0].resize(1);f[0][0].w[0]=1;
        for(int p=1;p<=P;p++){int maxShift=119*p,half=maxShift/2;f[p].resize(half+1);YBU320 win{};
            auto prev=[&](int sh)->const YBU320&{static const YBU320 Z{};int pm=119*(p-1);if(sh<0||sh>pm)return Z;int q=std::min(sh,pm-sh);return f[p-1][q];};
            for(int sh=0;sh<=half;sh++){yb_uadd(win,prev(sh));if(sh>=120)yb_usub(win,prev(sh-120));f[p][sh]=win;}}
    }
    const YBU320&at(int p,int sum)const{static const YBU320 Z{};if(p==0)return sum==0?f[0][0]:Z;int sh=sum-4*p,maxShift=119*p;if(sh<0||sh>maxShift)return Z;return f[p][std::min(sh,maxShift-sh)];}
};
int main(){
    volatile uint64_t sink=0;
    auto a=C::now();const auto&table=yb_month_count_table();auto b=C::now();sink^=table.f[47].back().w[0];
    constexpr int sharedN=5000;auto c=C::now();
    for(int i=0;i<sharedN;i++){int p=1+(i%47);int total=(4*p+123*p)/2;YBMonthDP d(total,p);sink^=d.at(p,total).w[0];}
    auto d=C::now();constexpr int legacyN=40;auto e=C::now();
    for(int i=0;i<legacyN;i++){int p=47,total=(4*p+123*p)/2;LegacyMonthDP x(total,p);sink^=x.at(p,total).w[0];}
    auto f=C::now();
    std::cout<<"shared_first_ms="<<elapsed(a,b)<<" shared_reuse_total_ms="<<elapsed(c,d)
             <<" shared_reuse_per_op_us="<<(elapsed(c,d)*1000.0/sharedN)
             <<" legacy_rebuild_total_ms="<<elapsed(e,f)
             <<" legacy_rebuild_per_op_ms="<<(elapsed(e,f)/legacyN)<<" sink="<<sink<<"\n";
}
