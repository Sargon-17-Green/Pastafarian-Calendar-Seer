#ifndef SAUCE_HEADER
#define SAUCE_HEADER "sauce_fast127_v12.hpp"
#endif
#include SAUCE_HEADER
#include <boost/multiprecision/cpp_int.hpp>
#include <array>
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

#include "canonical_saved_sum_reference.hpp"

static boost::multiprecision::cpp_int to_bi(U128 x){boost::multiprecision::cpp_int z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static std::string dec(U128 x){return to_bi(frep(x)).convert_to<std::string>();}
static void require(bool x,const std::string&m){if(!x)throw std::runtime_error(m);}
static void eq_bowls(const std::array<U128,6>&a,const reference::Bowls&b,const std::string&where){for(int i=0;i<6;i++)require(to_bi(a[i])==reference::red(b[i]),where+" bowl="+std::to_string(i+1));}

static bool same_fast(const FSauce& a, const FSauce& b) {
    for (int i=0;i<6;i++) if (a.bowls[i]!=b.bowls[i] || a.last[i]!=b.last[i]) return false;
    return true;
}
static bool same_trace(const FSauceTrace& a, const FSauceTrace& b) {
    if (a.afterDrop46!=b.afterDrop46) return false;
    return a.postStirs==b.postStirs;
}

int main(){
 auto stones=fast_stones();std::vector<std::pair<int64_t,int64_t>> cases={{-13334246,-13334246},{-13334246,-13334247},{-13334246,-13334245},{-13334247,-13334246},{-13334245,-13334246},{2461290,2461290},{2461290,2461247},{2461290,2464579},{2461290,-12829630},{2461290,6700000}};
 std::mt19937_64 rng(0x5A17C0FFEEULL);for(int i=0;i<256;i++){int64_t c=(int64_t)(rng()%50000001ULL)-25000000LL,t=(int64_t)(rng()%50000001ULL)-25000000LL;cases.push_back({c,t});}
 uint64_t checkpoints=0,descriptors=0;bool mutantKilled=false;std::string discriminator;
 const uint64_t seals[]={1,10,11,12,20,21,22,30,31,32,33};
 for(size_t k=0;k<cases.size();k++){
   auto[c,t]=cases[k];FSauceTrace ft;FSauce got=fast_sauce(c,t,stones,&ft);auto ref=reference::sauce(c,t);eq_bowls(ft.afterDrop46,ref.drop46,"drop46 case="+std::to_string(k));checkpoints++;
   for(int r=0;r<12;r++){eq_bowls(ft.postStirs[r],ref.stirs[r],"post-stir="+std::to_string(r+1)+" case="+std::to_string(k));checkpoints++;}
   eq_bowls(got.bowls,ref.stirs[11],"final case="+std::to_string(k));for(int i=0;i<6;i++)require(got.last[i]==ref.last[i],"drop46 order case="+std::to_string(k));
   for(int bowl=1;bowl<=6;bowl++)for(uint64_t seal:seals){auto gd=fast_desc(got,bowl,seal);auto rd=reference::desc(ref,bowl,seal);require(to_bi(gd.first)==reference::red(rd.first),"descriptor value");require(gd.forward==rd.second,"descriptor direction");descriptors++;}
   if(k==5){using reference::cpp_int;auto old=ref.drop46;cpp_int raw=0;for(auto&x:old)raw=reference::red(raw+x);cpp_int R=reference::red(raw+149);auto ord=reference::perm720(reference::rank720(R));int bi=ord[0]-1,pi=ord[5]-1,ni=ord[1]-1;cpp_int canonicalU=reference::red(old[bi]+3*old[pi]+5*old[ni]+R+1+1);cpp_int mutantU=reference::red(old[bi]+3*old[pi]+5*old[ni]+raw+1+1);require(raw!=R,"discriminator requires S != R");require(canonicalU!=mutantU,"rawSumMutant must differ at u");reference::Bowls canonicalNext{},mutantNext{};for(int pl=0;pl<6;pl++){int B=ord[pl]-1,P=ord[(pl+5)%6]-1,N=ord[(pl+1)%6]-1;cpp_int cu=reference::red(old[B]+3*old[P]+5*old[N]+R+1+(pl+1)*(pl+1));cpp_int mu=reference::red(old[B]+3*old[P]+5*old[N]+raw+1+(pl+1)*(pl+1));canonicalNext[B]=reference::red(cu*cu+7*old[P]*old[N]);mutantNext[B]=reference::red(mu*mu+7*old[P]*old[N]);}eq_bowls(ft.postStirs[0],canonicalNext,"real implementation vs canonical discriminator");bool differs=false;for(int i=0;i<6;i++)if(reference::red(mutantNext[i])!=reference::red(canonicalNext[i]))differs=true;require(differs,"rawSumMutant post-stir must differ");mutantKilled=true;discriminator="S="+reference::rep(raw).convert_to<std::string>()+" R="+reference::rep(R).convert_to<std::string>()+" canonical_u="+reference::rep(canonicalU).convert_to<std::string>()+" raw_mutant_u="+reference::rep(mutantU).convert_to<std::string>();}
 }
 require(mutantKilled,"mutant discriminator did not execute");
 // Explicit call-order/repeatability check: A -> B -> A must reproduce A byte-for-byte.
 FSauceTrace a1t,bt,a2t;
 FSauce a1=fast_sauce(2461290,2461290,stones,&a1t);
 FSauce b1=fast_sauce(2461290,-12829630,stones,&bt);
 FSauce a2=fast_sauce(2461290,2461290,stones,&a2t);
 require(same_fast(a1,a2) && same_trace(a1t,a2t),"A-B-A call-order independence failed");
 FSauceTrace a3t;FSauce a3=fast_sauce(2461290,2461290,fast_stones(),&a3t);
 require(same_fast(a1,a3) && same_trace(a1t,a3t),"fresh-stones repeatability failed");
 (void)b1;
 std::cout<<"saved-sum conformance: PASS\n";
 std::cout<<"cases="<<cases.size()<<" bowl_checkpoints="<<checkpoints<<" descriptors="<<descriptors<<"\n";
 std::cout<<"rawSumMutant=KILLED "<<discriminator<<"\n";
 std::cout<<"call_order=A-B-A:PASS fresh_stones_repeat:PASS\n";
}
