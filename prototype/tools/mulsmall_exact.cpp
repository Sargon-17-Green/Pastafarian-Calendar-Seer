#define main rns_mulsmall_disabled_main
#include "../src/rns_micro8_avx2_32x8_mulsmall.cpp"
#undef main
#include <random>
#include <iostream>
int main(){
    std::mt19937_64 rng(0x5A17F00DULL);
    for(int pk=0; pk<128; ++pk){
        int base=pk*8;
        if(base >= (int)RNS_PRIMES.size()) break;
        alignas(32) uint64_t pp[8],cc[8],aa[8];
        for(int l=0;l<8;l++){
            int i=std::min(base+l,(int)RNS_PRIMES.size()-1);
            pp[l]=RNS_PRIMES[i];cc[l]=B52-pp[l];
        }
        V8 vp=vload(pp),vc=vload(cc);
        for(int it=0;it<2000;it++){
            uint64_t b=rng()%5779;
            for(int l=0;l<8;l++) aa[l]=rng()%pp[l];
            V8 a=vload(aa), got=VMod::mul_small(a,b,vp,vc);
            alignas(32) uint64_t gg[8];vstore(gg,got);
            for(int l=0;l<8;l++){
                uint64_t want=mulmod52(aa[l],b,pp[l]);
                if(gg[l]!=want){
                    std::cerr<<"mismatch pk="<<pk<<" lane="<<l<<" it="<<it<<" a="<<aa[l]<<" b="<<b<<" p="<<pp[l]<<" got="<<gg[l]<<" want="<<want<<"\n";
                    return 1;
                }
            }
        }
    }
    std::cout<<"AVX2 mul_small primitive exact test: PASS\n";
    return 0;
}
