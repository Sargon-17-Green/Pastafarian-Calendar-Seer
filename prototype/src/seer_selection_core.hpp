#pragma once
#include "sauce_fast127_v12.hpp"
#include <boost/multiprecision/cpp_int.hpp>
#include <gmpxx.h>
#include <cstdint>
#include <stdexcept>
namespace seer_native::detail {
using BI=boost::multiprecision::cpp_int;

static BI yb_fu_to_bi(U128 x){BI z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static inline mpz_class yb_mpz_from_u64_exact(uint64_t x){mpz_class z=(unsigned long)(x>>32);z<<=32;z+=(unsigned long)(x&0xffffffffULL);return z;}
static mpz_class yb_fu_to_mpz(U128 x){mpz_class z=yb_mpz_from_u64_exact((uint64_t)(x>>64));z<<=64;z+=yb_mpz_from_u64_exact((uint64_t)x);return z;}
static BI yb_fast_choose_bi(const FSauce&so,int bowl,uint64_t seal,const BI&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);BI MM=yb_fu_to_bi(F127_M);
    if(n<=MM){BI c=yb_fu_to_bi(frep(d.first));BI accepted=seer_short_selection_accepted_o1(MM,n,c,d.forward);if(widthOut)*widthOut=1;return (accepted-1)%n+1;}
    int width=1;BI space=MM;while(space<n){space*=MM;width++;}BI wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(yb_fu_to_bi(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}BI lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?BI(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}
static mpz_class yb_fast_choose_mpz(const FSauce&so,int bowl,uint64_t seal,const mpz_class&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);mpz_class MM=yb_fu_to_mpz(F127_M);
    if(n<=MM){mpz_class c=yb_fu_to_mpz(frep(d.first));mpz_class accepted=seer_short_selection_accepted_o1(MM,n,c,d.forward);if(widthOut)*widthOut=1;return (accepted-1)%n+1;}
    int width=1;mpz_class space=MM;while(space<n){space*=MM;width++;}mpz_class wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(yb_fu_to_mpz(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}mpz_class lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?mpz_class(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}


} // namespace seer_native::detail
