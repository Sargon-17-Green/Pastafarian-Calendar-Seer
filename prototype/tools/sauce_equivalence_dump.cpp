#ifndef SAUCE_HEADER
#define SAUCE_HEADER "sauce_fast127_v3.hpp"
#endif
#include SAUCE_HEADER
#include <fstream>
#include <random>
#include <vector>
#include <cstring>
#include <iostream>
static void w128(std::ofstream&f,U128 x){uint64_t lo=(uint64_t)x,hi=(uint64_t)(x>>64);f.write((char*)&lo,8);f.write((char*)&hi,8);}
int main(int argc,char**argv){if(argc<2)return 2;std::ofstream out(argv[1],std::ios::binary);auto S=fast_stones();std::mt19937_64 rng(0x5A17C0FFEEULL);const uint64_t seals[]={1,10,11,12,20,21,22,30,31,32,33};
 for(int i=0;i<5000;i++){int64_t c=(int64_t)(rng()%50000001ULL)-25000000LL;int64_t t=(int64_t)(rng()%50000001ULL)-25000000LL;if(i==0)c=t=2461290;if(i==1){c=2461290;t=-12829630;}if(i==2)c=t=-13334246LL;if(i==3){c=-13334246LL;t=-13334245LL;}auto so=fast_sauce(c,t,S);for(auto x:so.bowls)w128(out,x);for(int x:so.last)out.write((char*)&x,sizeof(x));for(int b=1;b<=6;b++)for(uint64_t seal:seals){auto d=fast_desc(so,b,seal);w128(out,d.first);uint8_t fw=d.forward;out.write((char*)&fw,1);}}
}
