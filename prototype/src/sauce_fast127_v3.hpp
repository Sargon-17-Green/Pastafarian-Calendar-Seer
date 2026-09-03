#pragma once
#include <array>
#include <vector>
#include <cstdint>
#include <stdexcept>
#include <algorithm>
using U128=unsigned __int128;
static constexpr U128 F127_M=(U128(1)<<127)-1;
static constexpr uint64_t F127_HIMASK=(uint64_t(1)<<63)-1;

static inline U128 fadd(U128 a,U128 b){U128 s=a+b;U128 r=(s&F127_M)+(s>>127);if(r>=F127_M)r-=F127_M;return r;}
static inline U128 fsub(U128 a,U128 b){return a>=b?a-b:F127_M-(b-a);}
static inline U128 fmul(U128 a,U128 b){
    uint64_t a0=(uint64_t)a,a1=(uint64_t)(a>>64),b0=(uint64_t)b,b1=(uint64_t)(b>>64);
    U128 z0=U128(a0)*b0,z1=U128(a0)*b1,z2=U128(a1)*b0,z3=U128(a1)*b1;
    uint64_t l0=(uint64_t)z0;
    U128 t=(z0>>64)+(uint64_t)z1+(uint64_t)z2;uint64_t l1=(uint64_t)t;U128 c=t>>64;
    U128 t2=(z1>>64)+(z2>>64)+(uint64_t)z3+c;uint64_t l2=(uint64_t)t2;uint64_t l3=(uint64_t)((z3>>64)+(t2>>64));
    U128 lo=U128(l0)+(U128(l1&F127_HIMASK)<<64);
    U128 hi=U128(l1>>63)+(U128(l2)<<1)+(U128(l3)<<65);
    U128 s=lo+hi;U128 r=(s&F127_M)+(s>>127);if(r>=F127_M)r-=F127_M;return r;
}
static inline U128 fsq(U128 a){return fmul(a,a);}
static inline U128 fmul_small(U128 a,uint64_t k){
    uint64_t a0=(uint64_t)a,a1=(uint64_t)(a>>64);U128 z0=U128(a0)*k,z1=U128(a1)*k+(z0>>64);
    uint64_t l0=(uint64_t)z0,l1=(uint64_t)z1,l2=(uint64_t)(z1>>64);
    U128 lo=U128(l0)+(U128(l1&F127_HIMASK)<<64);U128 hi=U128(l1>>63)+(U128(l2)<<1);
    U128 s=lo+hi,r=(s&F127_M)+(s>>127);if(r>=F127_M)r-=F127_M;return r;
}
static inline U128 frep(U128 r){return r?r:F127_M;}
static inline uint64_t frep_mod(U128 r,uint64_t m){return (uint64_t)(frep(r)%m);}
static inline uint64_t frank720(U128 r){U128 x=frep(r);uint64_t lo=(uint64_t)x,hi=(uint64_t)(x>>64);uint64_t z=(lo%720 + (hi%720)*16)%720;return z?z:720;}
static inline U128 ffrom_u64(uint64_t x){return U128(x);}
static inline U128 fsum(std::initializer_list<U128> xs){U128 r=0;for(U128 x:xs)r=fadd(r,x);return r;}

static consteval std::array<std::array<int,6>,720> make_fperm_table(){std::array<std::array<int,6>,720>T{};const uint64_t fac[7]={1,1,2,6,24,120,720};for(uint64_t rank=1;rank<=720;rank++){uint64_t r=rank-1;int avail[6]={1,2,3,4,5,6};int n=6;for(int pos=0,rem=6;rem>=1;--rem,++pos){uint64_t block=fac[rem-1],q=r/block;r%=block;T[rank-1][pos]=avail[q];for(int j=(int)q;j<n-1;j++)avail[j]=avail[j+1];--n;}}return T;}
static constexpr auto FPERM720=make_fperm_table();
static inline const std::array<int,6>& fperm720(uint64_t rank){return FPERM720[rank-1];}
static constexpr uint64_t FBP[6]={17,19,23,29,31,37};
static constexpr int FPST[6]={0,1,2,3,4,0},FDST[3]={0,1,2},FDM[3]={3,5,7},FHGS[7]={0,1,2,3,4,0,1};
static constexpr int FVG[11][5]={{3,5,7,11,0},{5,7,11,13,1},{7,11,13,17,2},{11,13,17,19,3},{13,17,19,23,4},{17,19,23,29,0},{19,23,29,31,1},{23,29,31,37,2},{29,31,37,41,3},{31,37,41,43,4},{37,41,43,47,0}};
static constexpr int FHC[7][4]={{3,4,6,8},{5,7,10,12},{7,10,14,16},{9,13,18,20},{11,16,22,24},{13,19,26,28},{15,22,30,32}};
using FStones=std::array<std::array<U128,5>,46>;
static FStones fast_stones(){FStones R{};R[0]={17,29,43,71,101};for(int i=1;i<46;i++){auto&o=R[i-1];uint64_t d=i+1;R[i][0]=fsum({fsq(o[0]),fmul_small(o[1],3),U128(d)});R[i][1]=fsum({fsq(o[1]),fmul_small(o[2],5),o[0]});R[i][2]=fsum({fsq(o[2]),fmul_small(o[3],7),o[1]});R[i][3]=fsum({fsq(o[3]),fmul_small(o[4],11),o[2]});R[i][4]=fsum({fsq(o[4]),fmul_small(o[0],13),o[3]});}return R;}
struct FSauce{std::array<U128,6> bowls{};std::array<int,6> last{};};
static inline U128 fdaynum(int64_t d){constexpr int64_t F=-13334246LL;if(d==F)return 1;if(d>F)return U128(2)*uint64_t(d-F)+1;return U128(2)*uint64_t(F-d);}
static FSauce fast_sauce(int64_t cj,int64_t tj,const FStones&S){
    U128 calc=fdaynum(cj),target=fdaynum(tj),dist=uint64_t(cj>=tj?cj-tj:tj-cj)+1,sum=fadd(calc,target),dir=tj<cj?1:(tj==cj?2:3);bool smallCounters=((calc>>64)==0)&&((target>>64)==0)&&((dist>>64)==0)&&((sum>>64)==0);auto cmul=[&](U128 a,U128 b)->U128{return smallCounters?fmul_small(a,(uint64_t)b):fmul(a,b);};std::array<U128,8>hb{};
    for(int h=1;h<=7;h++){auto&s=S[h-1];U128 v=fsum({calc,fmul_small(target,FHC[h-1][0]),fmul_small(dist,FHC[h-1][1]),fmul_small(sum,FHC[h-1][2]),fmul_small(dir,FHC[h-1][3]),s[0],s[1],s[2],s[3],s[4]});for(int g=1;g<=7;g++)v=fsum({fsq(v),fmul_small(v,3),s[FHGS[g-1]],U128(g)});hb[h]=v;}
    std::array<U128,6>b{};for(int j=0;j<6;j++){U128 bn=j+1,x=fsum({calc,fmul_small(target,j+1),dist,sum,dir,U128(FBP[j]*FBP[j])});b[j]=fadd(fsq(x),bn);}std::array<U128,47>seq{};std::array<int,6>last{};auto seqv=[&](int i)->U128{return i>=1?seq[i]:hb[1-i];};
    for(int drop=1;drop<=46;drop++){auto&s=S[drop-1];U128 p=seqv(drop-1),p3=seqv(drop-3),p7=seqv(drop-7),v=fsum({cmul(s[0],calc),cmul(s[1],target),cmul(s[2],dist),cmul(s[3],sum),fmul_small(s[4],(uint64_t)dir),p,fmul_small(p3,3),fmul_small(p7,5),U128(drop)});for(int g=0;g<11;g++){auto&q=FVG[g];v=fsum({fsq(v),fmul_small(v,q[0]),fmul_small(p,q[1]),fmul_small(p3,q[2]),fmul_small(p7,q[3]),s[q[4]]});}seq[drop]=v;auto ord=fperm720(frank720(v));last=ord;auto old=b;std::array<U128,6>direct{};for(int pl=0;pl<3;pl++){int bi=ord[pl]-1;direct[bi]=fsum({fsq(v),fmul(s[FDST[pl]],old[bi]),U128(FDM[pl]*drop)});}std::array<U128,6>next{};for(int pl=0;pl<6;pl++){int bi=ord[pl]-1,pi=ord[(pl+5)%6]-1,ni=ord[(pl+1)%6]-1;U128 u=fsum({old[bi],fmul_small(old[pi],2),fmul_small(old[ni],3),direct[bi],v,s[FPST[pl]]});next[bi]=fsum({fsq(u),fmul_small(fmul(old[pi],old[ni]),5),U128(drop*(pl+1))});}b=next;}
    for(int round=1;round<=12;round++){auto old=b;U128 raw=0;for(U128 x:old)raw=fadd(raw,x);U128 orderNo=fadd(raw,U128(149*round));auto ord=fperm720(frank720(orderNo));std::array<U128,6>next{};for(int pl=0;pl<6;pl++){int bi=ord[pl]-1,pi=ord[(pl+5)%6]-1,ni=ord[(pl+1)%6]-1;U128 u=fsum({old[bi],fmul_small(old[pi],3),fmul_small(old[ni],5),raw,U128(round+(pl+1)*(pl+1))});next[bi]=fadd(fsq(u),fmul_small(fmul(old[pi],old[ni]),7));}b=next;}
    return{b,last};
}
struct FDesc{U128 first;bool forward;};
static FDesc fast_desc(const FSauce&s,int bowl,uint64_t seal){int pl=0;while(s.last[pl]!=bowl)pl++;int ni=s.last[(pl+1)%6]-1;U128 first=fsum({fsq(fsum({s.bowls[bowl-1],U128(seal+181)})),fmul_small(s.bowls[ni],179),U128(seal)});U128 dn=fsum({fsq(fsum({first,U128(seal+194)})),fmul_small(first,193),fmul_small(s.bowls[5],197)});return{first,(frep(dn)&1)!=0};}
static uint64_t fast_choose_small(const FSauce&s,int bowl,uint64_t seal,uint64_t n){auto d=fast_desc(s,bowl,seal);U128 lim=(F127_M/n)*n,c=frep(d.first);while(c>lim)c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);return (uint64_t)((c-1)%n)+1;}
