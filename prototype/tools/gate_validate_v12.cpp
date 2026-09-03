#ifndef SAUCE_HEADER
#define SAUCE_HEADER "sauce_fast127_v12.hpp"
#endif
#include SAUCE_HEADER
#include <fstream>
#include <iostream>
#include <vector>
int main(int argc,char**argv){if(argc<2)return 2;std::ifstream f(argv[1],std::ios::binary);std::vector<uint16_t> g(40000);f.read((char*)g.data(),g.size()*2);if(f.gcount()!=80000){std::cerr<<"bad gate file\n";return 3;}auto S=fast_stones();const int64_t F=-13334246LL;int bad=0;uint64_t sum=0;int mn=9999,mx=0;for(int i=1;i<=40000;i++){uint64_t x=fast_choose_small(fast_sauce(F,F+i,S),1,1,922)+41;sum+=x;mn=std::min(mn,(int)x);mx=std::max(mx,(int)x);if(x!=g[i-1]){if(bad<5)std::cerr<<"mismatch i="<<i<<" got="<<x<<" exp="<<g[i-1]<<"\n";bad++;}}std::cout<<"bad="<<bad<<" min="<<mn<<" max="<<mx<<" sum="<<sum<<"\n";return bad?1:0;}
