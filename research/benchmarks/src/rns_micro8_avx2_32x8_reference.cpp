#include <immintrin.h>
#include <gmpxx.h>
#include <omp.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <barrier>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <numeric>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>
#include "rns_primes32.hpp"

using Clock=std::chrono::steady_clock;
static double ms(Clock::time_point a,Clock::time_point b){return std::chrono::duration<double,std::milli>(b-a).count();}
static constexpr uint64_t B52=1ULL<<32;
static constexpr uint64_t MASK52=B52-1;
static constexpr int MAXM=47;

static uint64_t inv_mod_u64(uint64_t a,uint64_t p){
    __int128 t=0,newt=1; uint64_t r=p,newr=a;
    while(newr){uint64_t q=r/newr; uint64_t nr=r-q*newr; r=newr;newr=nr; __int128 nt=t-(__int128)q*newt;t=newt;newt=nt;}
    if(r!=1) throw std::runtime_error("not invertible");
    __int128 x=t%(__int128)p;if(x<0)x+=p;return (uint64_t)x;
}
static std::vector<uint64_t> make_primes(int count){if(count<0||count>(int)RNS_PRIMES.size())throw std::runtime_error("prime count");return std::vector<uint64_t>(RNS_PRIMES.begin(),RNS_PRIMES.begin()+count);}
static inline uint64_t mulmod52(uint64_t a,uint64_t b,uint64_t p){
    uint64_t c=B52-p,z=a*b,lo=z&MASK52,hi=z>>32;
    uint64_t y=lo+hi*c;
    uint64_t r=(y&MASK52)+(y>>32)*c;
    if(r>=p)r-=p;
    if(r>=p)r-=p;
    return r;
}
static inline uint64_t addmod52(uint64_t a,uint64_t b,uint64_t p){uint64_t s=a+b;if(s>=p)s-=p;return s;}
static inline uint64_t submod52(uint64_t a,uint64_t b,uint64_t p){return a>=b?a-b:p-(b-a);}

struct V8{__m256i v;};
static inline V8 vzero(){return {_mm256_setzero_si256()};}
static inline V8 vsmall(uint64_t x){return {_mm256_set1_epi32((int)(uint32_t)x)};}
static inline V8 vload(const uint64_t* p){return {_mm256_setr_epi32((int)(uint32_t)p[0],(int)(uint32_t)p[1],(int)(uint32_t)p[2],(int)(uint32_t)p[3],(int)(uint32_t)p[4],(int)(uint32_t)p[5],(int)(uint32_t)p[6],(int)(uint32_t)p[7])};}
static inline void vstore(uint64_t* p,const V8&x){alignas(32) uint32_t t[8];_mm256_store_si256((__m256i*)t,x.v);for(int i=0;i<8;i++)p[i]=t[i];}
static inline V8 vmaskload(int avail,const uint64_t* p){alignas(32) uint64_t t[8]{};for(int i=0;i<avail;i++)t[i]=p[i];return vload(t);}
static inline __m256i ugt32(__m256i a,__m256i b){const __m256i sign=_mm256_set1_epi32((int)0x80000000u);return _mm256_cmpgt_epi32(_mm256_xor_si256(a,sign),_mm256_xor_si256(b,sign));}
static inline __m256i uge32(__m256i a,__m256i b){return _mm256_or_si256(ugt32(a,b),_mm256_cmpeq_epi32(a,b));}
static inline __m256i reduce32x4(__m256i z,__m256i p64,__m256i c64){
    const __m256i mask=_mm256_set1_epi64x(0xffffffffULL);
    __m256i lo=_mm256_and_si256(z,mask),hi=_mm256_srli_epi64(z,32);
    __m256i y=_mm256_add_epi64(lo,_mm256_mul_epu32(hi,c64));
    __m256i r=_mm256_add_epi64(_mm256_and_si256(y,mask),_mm256_mul_epu32(_mm256_srli_epi64(y,32),c64));
    __m256i gt=_mm256_cmpgt_epi64(r,p64),eq=_mm256_cmpeq_epi64(r,p64),ge=_mm256_or_si256(gt,eq);
    r=_mm256_sub_epi64(r,_mm256_and_si256(ge,p64));
    return r;
}
static inline __m256i mul32x8(__m256i a,__m256i b,__m256i p,__m256i c){
    const __m256i mask=_mm256_set1_epi64x(0xffffffffULL);
    __m256i pe=_mm256_and_si256(p,mask),po=_mm256_srli_epi64(p,32);
    __m256i ce=_mm256_and_si256(c,mask),co=_mm256_srli_epi64(c,32);
    __m256i ze=_mm256_mul_epu32(a,b);
    __m256i zo=_mm256_mul_epu32(_mm256_srli_epi64(a,32),_mm256_srli_epi64(b,32));
    __m256i re=reduce32x4(ze,pe,ce),ro=reduce32x4(zo,po,co);
    return _mm256_or_si256(re,_mm256_slli_epi64(ro,32));
}
static inline __m256i add32x8(__m256i a,__m256i b,__m256i p,__m256i c){
    __m256i s=_mm256_add_epi32(a,b);__m256i carry=ugt32(a,s);s=_mm256_add_epi32(s,_mm256_and_si256(carry,c));
    __m256i ge=uge32(s,p);return _mm256_sub_epi32(s,_mm256_and_si256(ge,p));
}
static inline __m256i sub32x8(__m256i a,__m256i b,__m256i p,__m256i c){
    __m256i borrow=ugt32(b,a);__m256i d=_mm256_sub_epi32(a,b);return _mm256_sub_epi32(d,_mm256_and_si256(borrow,c));
}
struct VMod{
    static inline V8 mul(const V8&a,const V8&b,const V8&p,const V8&c){return {mul32x8(a.v,b.v,p.v,c.v)};}
    static inline V8 mul_small(const V8&a,uint64_t b,const V8&p,const V8&c){return {mul32x8(a.v,_mm256_set1_epi32((int)(uint32_t)b),p.v,c.v)};}
    static inline V8 add(const V8&a,const V8&b,const V8&p){ // recover c=2^32-p by two's complement
        __m256i c=_mm256_sub_epi32(_mm256_setzero_si256(),p.v);return {add32x8(a.v,b.v,p.v,c)};
    }
    static inline V8 sub(const V8&a,const V8&b,const V8&p){__m256i c=_mm256_sub_epi32(_mm256_setzero_si256(),p.v);return {sub32x8(a.v,b.v,p.v,c)};}
};

struct Scaled{
    long double m=0; int e=0; bool ok=true;
    static Scaled zero(){return {};}
    static Scaled one(){Scaled x;x.m=.5L;x.e=1;return x;}
};
static inline Scaled snorm(long double m,int e=0){Scaled x;if(!std::isfinite(m)){x.ok=false;x.m=m;x.e=e;return x;}if(m==0){return x;}int k=0;long double mm=frexpl(m,&k);x.m=mm;x.e=e+k;return x;}
static inline Scaled smul(const Scaled&a,const Scaled&b){if(!a.ok||!b.ok){Scaled z;z.ok=false;return z;}return snorm(a.m*b.m,a.e+b.e);}
static inline Scaled smul_scalar(const Scaled&a,long double b){if(!a.ok||!std::isfinite(b)){Scaled z;z.ok=false;return z;}return snorm(a.m*b,a.e);}
static inline Scaled sadd(const Scaled&a,const Scaled&b){
    if(!a.ok||!b.ok){Scaled z;z.ok=false;return z;}if(a.m==0)return b;if(b.m==0)return a;
    const Scaled *hi=&a,*lo=&b;if(a.e<b.e){hi=&b;lo=&a;}int de=lo->e-hi->e;if(de<-20000)return *hi;return snorm(hi->m+scalbnl(lo->m,de),hi->e);
}
static inline Scaled ssub(const Scaled&a,const Scaled&b){
    if(!a.ok||!b.ok||a.m==0){Scaled z;z.ok=false;return z;}if(b.m==0)return a;int de=b.e-a.e;if(de>100){Scaled z;z.ok=false;return z;}long double bm=de<-20000?0:scalbnl(b.m,de);long double m=a.m-bm;if(!(m>0)||!std::isfinite(m)){Scaled z;z.ok=false;return z;}return snorm(m,a.e);
}
static inline long double sratio(const Scaled&a,const Scaled&b){if(!a.ok||!b.ok||b.m==0)return NAN;int de=a.e-b.e;if(de<-20000)return 0;if(de>20000)return HUGE_VALL;return scalbnl(a.m/b.m,de);}
static Scaled binom_scaled(unsigned n,unsigned k){if(k>n)return Scaled::zero();k=std::min(k,n-k);Scaled x=Scaled::one();for(unsigned i=1;i<=k;i++){x=smul_scalar(x,(long double)(n-k+i));x=smul_scalar(x,1.0L/(long double)i);}return x;}

struct ApproxTable{
    std::vector<int> len,pref,rowExp;int m=0;std::vector<std::vector<long double>> f;
    explicit ApproxTable(const std::vector<int>&L):len(L),m((int)L.size()){
        pref.resize(m);int s=0;for(int i=0;i<m;i++){s+=len[i]-1;pref[i]=s;}
        f.resize(m);rowExp.assign(m,0);
        f[m-1].assign(pref[m-1]+2,1.0L);rowExp[m-1]=0;
        for(int h=m-2;h>=0;--h){
            int qmax=pref[h]+1,n=len[h+1];f[h].assign(qmax+1,0.0L);
            long double cum=0.0L,w=1.0L;
            const auto &next=f[h+1];
            for(int q=1;q<=qmax;q++){
                int r=q-1;cum += w*next[n+r];f[h][q]=cum;
                w *= (long double)(n+r-1)/(long double)q;
            }
            long double mx=f[h][qmax];
            if(!(mx>0)||!std::isfinite(mx)) throw std::runtime_error("fast approx row overflow");
            int eadd=0;frexpl(mx,&eadd);long double scale=scalbnl(1.0L,-eadd);
            for(int q=1;q<=qmax;q++)f[h][q]*=scale;
            rowExp[h]=rowExp[h+1]+eadd;
        }
    }
};

struct ExactTable{
    std::vector<int> len,pref;int m=0;std::vector<std::vector<mpz_class>> f;mpz_class N;
    explicit ExactTable(const std::vector<int>&L):len(L),m((int)L.size()){
        pref.resize(m);int s=0;for(int i=0;i<m;i++){s+=len[i]-1;pref[i]=s;}
        f.resize(m);f[m-1].assign(pref[m-1]+2,mpz_class(1));
        for(int h=m-2;h>=0;--h){int qmax=pref[h]+1,n=len[h+1];f[h].assign(qmax+1,0);mpz_class cum=0,w=1;for(int q=1;q<=qmax;q++){int r=q-1;cum+=w*f[h+1][n+r];f[h][q]=cum;w*=n+r-1;mpz_divexact_ui(w.get_mpz_t(),w.get_mpz_t(),q);}}
        N=f[0][len[0]];
    }
};

struct StructState{int pos=1,low=0,high=0,R=0,d=0;std::array<int,MAXM> rem{};};
static StructState initial_struct(const std::vector<int>&len){StructState s;for(int i=0;i<(int)len.size();i++)s.rem[i]=len[i];s.rem[0]--;s.R=s.rem[0];return s;}

static long double mpz_ratio_ld(const mpz_class& num,const mpz_class& den){
    if(num==0)return 0; if(num<0||den<=0) return NAN;
    size_t bn=mpz_sizeinbase(num.get_mpz_t(),2), bd=mpz_sizeinbase(den.get_mpz_t(),2);
    unsigned tn=(unsigned)std::min<size_t>(64,bn), td=(unsigned)std::min<size_t>(64,bd);
    mpz_class an=num, ad=den; if(bn>tn) an >>= (bn-tn); if(bd>td) ad >>= (bd-td);
    uint64_t un=mpz_get_ui(an.get_mpz_t()), ud=mpz_get_ui(ad.get_mpz_t());
    int en=(int)bn-(int)tn, ed=(int)bd-(int)td;
    return scalbnl((long double)un/(long double)ud,en-ed);
}

struct Predictor{
    const ApproxTable* tab=nullptr;StructState st;std::array<Scaled,MAXM> H{},B{};long double u=0,v=0;bool ok=true;uint64_t forced=0;
    void reset(const StructState&s,const mpz_class&rank,const mpz_class&total){st=s;ok=true;int d=s.d;for(int h=s.high;h<tab->m;h++){int q=tab->pref[h]-d+1;if(q<0||q>=(int)tab->f[h].size()){ok=false;return;}H[h]=snorm(tab->f[h][q],tab->rowExp[h]);if(h<tab->m-1){int Rh=tab->pref[h]-d,n=tab->len[h+1];B[h]=binom_scaled((unsigned)(Rh+n-2),(unsigned)(n-2));}}
        u=mpz_ratio_ld(rank-1,total);v=mpz_ratio_ld(total-rank,total);if(!std::isfinite(u)||!std::isfinite(v))ok=false;
    }
    void reset_uv(long double nu,long double nv){u=nu;v=nv;if(!std::isfinite(u)||!std::isfinite(v)||u<0||v<0)ok=false;}
    void advance_d(){int oldd=st.d;for(int h=st.high;h<tab->m-1;h++){auto t=smul(B[h],H[h+1]);H[h]=ssub(H[h],t);if(!H[h].ok){ok=false;return;}}
        for(int h=st.high;h<tab->m-1;h++){int Rh=tab->pref[h]-oldd,n=tab->len[h+1];if(Rh<=0)B[h]=Scaled::zero();else B[h]=smul_scalar(B[h],(long double)Rh/(long double)(Rh+n-2));}st.d++;}
    struct P{int month;long double p;bool open;};
    std::vector<P> probs(){std::vector<P> out;if(!ok)return out;long double ar=1,op=0;if(st.high<tab->m-1){auto ot=smul(B[st.high],H[st.high+1]);auto ah=ssub(H[st.high],ot);if(!ot.ok||!ah.ok){ok=false;return out;}op=sratio(ot,H[st.high]);ar=sratio(ah,H[st.high]);if(!std::isfinite(op)||!std::isfinite(ar)||op<0||ar<0){ok=false;return {};}}
        int span=st.high-st.low+1;std::array<int,MAXM> pref{};int run=0;for(int i=st.low;i<=st.high;i++){run+=st.rem[i];pref[i-st.low]=run;}std::array<long double,MAXM+1> sp{},sm{};sp[span]=sm[span]=1;for(int off=span-1;off>=0;--off){sp[off]=sp[off+1]*(long double)pref[off];sm[off]=sm[off+1]*(long double)(pref[off]-1);}for(int month=st.low;month<=st.high;month++){int rf=st.rem[month];if(rf==1&&month!=st.low)continue;int off=month-st.low;long double rr=rf>1?((long double)(rf-1)*sp[off])/((long double)st.R*sm[off]):sp[off+1]/((long double)st.R*sm[off+1]);out.push_back({month,rr*ar,false});}if(st.high+1<tab->m)out.push_back({st.high+1,op,true});return out;}
    int step(){auto ps=probs();if(!ok||ps.empty()){ok=false;return -1;}int n=ps.size();std::vector<long double> pre(n+1),suf(n+1);for(int i=0;i<n;i++)pre[i+1]=pre[i]+ps[i].p;for(int i=n-1;i>=0;i--)suf[i]=suf[i+1]+ps[i].p;bool left=u<=v;int idx=-1;if(left){for(int i=0;i<n;i++)if(u<pre[i+1]){idx=i;break;}}else{for(int i=n-1;i>=0;i--)if(v<suf[i]){idx=i;break;}}if(idx<0){idx=left?n-1:0;forced++;}long double p=ps[idx].p;if(!(p>0)){ok=false;return -1;}long double nu=(u-pre[idx])/p,nv=(v-suf[idx+1])/p;if(!std::isfinite(nu)||!std::isfinite(nv)){ok=false;return -1;}u=nu;v=nv;auto b=ps[idx];int month=b.month;if(b.open){st.high=month;st.rem[month]--;st.R+=tab->len[month]-1;if(st.low>month-1)st.low=month;}else{st.rem[month]--;st.R--;if(st.rem[month]==0)st.low++;advance_d();if(!ok)return -1;}st.pos++;return month;}
};

struct StepMeta{int low,high,R,d,chosen;bool open;std::array<int,MAXM> cum{};};
static StepMeta make_meta_and_apply(StructState& s,const std::vector<int>&len,const std::vector<int>&pref,int chosen){
    StepMeta x;x.low=s.low;x.high=s.high;x.R=s.R;x.d=s.d;x.chosen=chosen;x.open=(chosen==s.high+1);int run=0;for(int i=s.low;i<=s.high;i++){run+=s.rem[i];x.cum[i]=run;}
    if(x.open){if(chosen>=(int)len.size())throw std::runtime_error("illegal open");s.high=chosen;s.rem[chosen]--;s.R+=len[chosen]-1;if(s.low>chosen-1)s.low=chosen;}
    else{if(chosen<s.low||chosen>s.high||s.rem[chosen]<=0||(s.rem[chosen]==1&&chosen!=s.low))throw std::runtime_error("illegal active");s.rem[chosen]--;s.R--;if(s.rem[chosen]==0)s.low++;s.d++;}
    s.pos++;return x;
}

struct PackConst{alignas(64) uint64_t p[8],c[8];V8 vp,vc;std::vector<V8> inv,bcommon;};
struct PackState{std::array<V8,MAXM> H{},B{};V8 A=vsmall(1),O=vzero(),rankR=vzero();};
struct RnsEngine{
    std::vector<int> len,pref;int m,total,npr,npacks,threads,commonN=0,commonFreq=0;std::vector<uint64_t> primes;std::vector<long double> invp,logP,logFact;std::vector<mpz_class> Pprefix;std::vector<uint64_t> garnerInv;
    std::vector<PackConst> pc;std::vector<PackState> initPacks;double count_ms=0,fracmeta_ms=0;std::vector<uint64_t> Nres;
    RnsEngine(const std::vector<int>&L,int npr_,int threads_):len(L),m(L.size()),npr(npr_),threads(threads_){total=std::accumulate(len.begin(),len.end(),0);pref.resize(m);int s=0;for(int i=0;i<m;i++){s+=len[i]-1;pref[i]=s;}std::array<int,124> fql{};for(int h=0;h<m-1;h++)fql[len[h+1]]++;for(int n=1;n<=123;n++)if(fql[n]>commonFreq){commonFreq=fql[n];commonN=n;}primes=make_primes(npr);npacks=(npr+7)/8;invp.resize(npr);for(int i=0;i<npr;i++)invp[i]=1.0L/(long double)primes[i];
        Pprefix.resize(npr+1);Pprefix[0]=1;garnerInv.resize(npr);garnerInv[0]=1;logP.assign(npr+1,0);for(int i=0;i<npr;i++){if(i>0){uint64_t pm=mpz_fdiv_ui(Pprefix[i].get_mpz_t(),primes[i]);garnerInv[i]=inv_mod_u64(pm,primes[i]);}Pprefix[i+1]=Pprefix[i]*primes[i];logP[i+1]=logP[i]+log2l((long double)primes[i]);}
        logFact.assign(total+1,0);for(int i=1;i<=total;i++)logFact[i]=logFact[i-1]+log2l((long double)i);
        fracmeta_ms=0;
        pc.resize(npacks);initPacks.resize(npacks);Nres.resize(npr);
        auto a=Clock::now();omp_set_num_threads(threads);
#pragma omp parallel for schedule(static)
        for(int pk=0;pk<npacks;pk++) build_pack(pk);
        auto b=Clock::now();count_ms=ms(a,b);
        for(int pk=0;pk<npacks;pk++){alignas(64)uint64_t rr[8];vstore(rr,initPacks[pk].H[0]);for(int l=0;l<8;l++){int i=pk*8+l;if(i<npr)Nres[i]=rr[l];}}
    }
    void build_pack(int pk){
        auto &q=pc[pk];for(int l=0;l<8;l++){int i=pk*8+l;uint64_t p=i<npr?primes[i]:primes.back();q.p[l]=p;q.c[l]=B52-p;}q.vp=vload(q.p);q.vc=vload(q.c);
        int maxv=total+2;q.inv.resize(maxv);std::vector<V8> fact(maxv);fact[0]=vsmall(1);for(int i=1;i<maxv;i++)fact[i]=VMod::mul_small(fact[i-1],i,q.vp,q.vc);alignas(64)uint64_t ff[8],ii[8];vstore(ff,fact[maxv-1]);for(int l=0;l<8;l++)ii[l]=inv_mod_u64(ff[l],q.p[l]);V8 acc=vload(ii);for(int i=maxv-1;i>=1;i--){q.inv[i]=VMod::mul(acc,fact[i-1],q.vp,q.vc);acc=VMod::mul_small(acc,i,q.vp,q.vc);}q.inv[0]=vzero();fact.clear();fact.shrink_to_fit();
        auto &st=initPacks[pk];st.H[m-1]=vsmall(1);st.B[m-1]=vzero();
        int cn=commonN;std::array<int,124> freq{},maxrByN{};for(int h=0;h<m-1;h++){int n=len[h+1];freq[n]++;maxrByN[n]=std::max(maxrByN[n],pref[h]);}
        std::array<std::vector<V8>,124> wc;
        for(int n=1;n<=123;n++)if(freq[n]>1){int mr=maxrByN[n];wc[n].resize(mr+1);wc[n][0]=vsmall(1);for(int r=0;r<mr;r++){auto w=VMod::mul_small(wc[n][r],n+r-1,q.vp,q.vc);wc[n][r+1]=VMod::mul(w,q.inv[r+1],q.vp,q.vc);}}
        std::vector<V8> following(pref.back()+2,vsmall(1)),current;
        for(int h=m-2;h>=0;--h){int qmax=pref[h]+1,n=len[h+1];current.assign(qmax+1,vzero());V8 cum=vzero(),w=vsmall(1),Blast=vsmall(1);bool cached=freq[n]>1;for(int qq=1;qq<=qmax;qq++){int r=qq-1;V8 ww=cached?wc[n][r]:w;auto term=VMod::mul(ww,following[n+r],q.vp,q.vc);cum=VMod::add(cum,term,q.vp);current[qq]=cum;if(qq==qmax)Blast=ww;if(!cached){w=VMod::mul_small(w,n+r-1,q.vp,q.vc);w=VMod::mul(w,q.inv[qq],q.vp,q.vc);}}st.H[h]=current[qmax];st.B[h]=Blast;following.swap(current);}
        q.bcommon=std::move(wc[cn]);
        st.A=vsmall(1);st.O=vzero();st.rankR=vzero();
    }
    mpz_class crt(const std::vector<uint64_t>&r,int k) const{mpz_class x=0;for(int i=0;i<k;i++){uint64_t pi=primes[i],xm=mpz_fdiv_ui(x.get_mpz_t(),pi);uint64_t delta=r[i]>=xm?r[i]-xm:pi-(xm-r[i]);uint64_t t=(uint64_t)((__uint128_t)delta*garnerInv[i]%pi);if(t)x+=Pprefix[i]*t;}return x;}
    void crt2(const std::vector<uint64_t>&a,const std::vector<uint64_t>&b,int k,mpz_class&xa,mpz_class&xb) const{xa=0;xb=0;for(int i=0;i<k;i++){uint64_t p=primes[i];uint64_t am=mpz_fdiv_ui(xa.get_mpz_t(),p),bm=mpz_fdiv_ui(xb.get_mpz_t(),p);uint64_t da=a[i]>=am?a[i]-am:p-(am-a[i]);uint64_t db=b[i]>=bm?b[i]-bm:p-(bm-b[i]);uint64_t ta=(uint64_t)((__uint128_t)da*garnerInv[i]%p),tb=(uint64_t)((__uint128_t)db*garnerInv[i]%p);if(ta)xa+=Pprefix[i]*ta;if(tb)xb+=Pprefix[i]*tb;}}
    int basis_for(const mpz_class&x,int maxk) const{int lo=1,hi=maxk;while(lo<hi){int md=(lo+hi)/2;if(Pprefix[md]>x)hi=md;else lo=md+1;}if(Pprefix[lo]<=x)throw std::runtime_error("basis too small");return lo;}
    int predictor_basis(const StructState&s,int maxk) const{int remtot=0;long double lu=0;for(int i=0;i<m;i++){remtot+=s.rem[i];lu-=logFact[s.rem[i]];}lu+=logFact[remtot];long double need=lu+4.0L;int lo=1,hi=maxk;while(lo<hi){int md=(lo+hi)/2;if(logP[md]>need)hi=md;else lo=md+1;}return lo;}
};

struct FastState{StructState st;std::vector<PackState> pack;int k=0;std::vector<uint64_t> coeff;mpz_class rank,total;};

static std::vector<uint64_t> init_coeff(const RnsEngine&e,int k){std::vector<uint64_t> c(k);for(int i=0;i<k;i++){uint64_t p=e.primes[i],prod=1;for(int j=0;j<k;j++)if(j!=i){uint64_t x=e.primes[j]%p;prod=mulmod52(prod,x,p);}c[i]=inv_mod_u64(prod,p);}return c;}
static void shrink_coeff(const RnsEngine&e,std::vector<uint64_t>&c,int oldk,int newk){if(newk>=oldk){c.resize(newk);return;}for(int i=0;i<newk;i++){uint64_t p=e.primes[i],q=1;for(int j=newk;j<oldk;j++)q=mulmod52(q,e.primes[j]%p,p);c[i]=mulmod52(c[i],q,p);}c.resize(newk);}

struct Frac3{long double value=0;std::array<uint64_t,3> digit{};bool ok=true;};
static Frac3 frac3(const RnsEngine&e,const std::vector<uint64_t>&res,const std::vector<uint64_t>&coeff,int k){Frac3 out;if(k==0){out.ok=false;return out;}std::vector<uint64_t> n(k);bool allzero=true;for(int i=0;i<k;i++){n[i]=mulmod52(res[i],coeff[i],e.primes[i]);if(res[i])allzero=false;}if(allzero){out.value=0;return out;}
    for(int layer=0;layer<3;layer++){uint64_t sumq=0;long double sum=0,corr=0;for(int i=0;i<k;i++){uint64_t p=e.primes[i],cc=B52-p;__uint128_t cn=(__uint128_t)cc*n[i];uint64_t q0=(uint64_t)(cn>>32),r0=(uint64_t)cn&MASK52;uint64_t y=r0+q0*cc;uint64_t ex=q0;if(y>=p){y-=p;ex++;}uint64_t q=n[i]+ex;sumq+=q;n[i]=y;long double term=(long double)y*e.invp[i];long double yy=term-corr,tt=sum+yy;corr=(tt-sum)-yy;sum=tt;}long double nearest=floorl(sum);long double frac=sum-nearest;if(frac<0)frac+=1; // diagnostic only
        uint64_t carry=(uint64_t)floorl(sum+1e-18L);out.digit[layer]=(sumq+carry)&MASK52;}
    out.value=ldexpl((long double)out.digit[0],-32)+ldexpl((long double)out.digit[1],-64)+ldexpl((long double)out.digit[2],-96);if(!(out.value>=0)||!std::isfinite(out.value))out.ok=false;return out;}


struct FracAdaptive{long double value=0;int layers=0,firstnz=0;bool ok=true;};
static FracAdaptive frac_adaptive(const RnsEngine&e,const std::vector<uint64_t>&res,const std::vector<uint64_t>&coeff,int k,int maxlayers=96){
    FracAdaptive out;if(k==0){out.ok=false;return out;}std::vector<uint64_t> n(k);bool allzero=true;for(int i=0;i<k;i++){n[i]=mulmod52(res[i],coeff[i],e.primes[i]);if(res[i])allzero=false;}if(allzero)return out;
    bool seen=false;int sig=0;long double val=0;
    for(int layer=0;layer<maxlayers;layer++){uint64_t sumq=0;long double sum=0,corr=0;for(int i=0;i<k;i++){uint64_t p=e.primes[i],cc=B52-p;__uint128_t cn=(__uint128_t)cc*n[i];uint64_t q0=(uint64_t)(cn>>32),r0=(uint64_t)cn&MASK52;uint64_t y=r0+q0*cc;uint64_t ex=q0;if(y>=p){y-=p;ex++;}sumq+=n[i]+ex;n[i]=y;long double term=(long double)y*e.invp[i];long double yy=term-corr,tt=sum+yy;corr=(tt-sum)-yy;sum=tt;}uint64_t carry=(uint64_t)floorl(sum+1e-18L);uint64_t dig=(sumq+carry)&MASK52;out.layers=layer+1;if(dig){seen=true;sig++;}else if(seen)sig++;val += scalbnl((long double)dig,-32*(layer+1));if(seen&&sig>=3){out.value=val;return out;}}
    out.value=val;if(!seen)out.ok=false;return out;
}
static void gather_vals(const RnsEngine&e,const FastState&s,std::vector<uint64_t>&O,std::vector<uint64_t>&S,std::vector<uint64_t>*U=nullptr,std::vector<uint64_t>*V=nullptr){int k=s.k;O.resize(k);S.resize(k);if(U)U->resize(k);if(V)V->resize(k);int packs=(k+7)/8;for(int pk=0;pk<packs;pk++){const auto&q=e.pc[pk];const auto&z=s.pack[pk];V8 sv=VMod::mul(z.A,z.H[s.st.high],q.vp,q.vc);V8 xv=VMod::sub(z.rankR,z.O,q.vp);alignas(64)uint64_t oo[8],ss[8],xx[8];vstore(oo,z.O);vstore(ss,sv);vstore(xx,xv);for(int l=0;l<8;l++){int i=pk*8+l;if(i>=k)break;O[i]=oo[l];S[i]=ss[l];if(U){(*U)[i]=xx[l]==0?e.primes[i]-1:xx[l]-1;}if(V){(*V)[i]=submod52(ss[l],xx[l],e.primes[i]);}}}}

struct FracTriple{FracAdaptive u,v,s;};
static inline V8 frac_digit_step(const V8&n,const PackConst&q,V8 &qsumv){
    alignas(32) uint64_t nv[8],yv[8],qv[8];vstore(nv,n);
    for(int i=0;i<8;i++){
        uint64_t p=q.p[i],cc=q.c[i];
        uint64_t cn=cc*nv[i];
        uint64_t q0=cn>>32,r0=cn&MASK52;
        uint64_t yy=r0+q0*cc,ex=q0;
        if(yy>=p){yy-=p;ex++;}
        yv[i]=yy;qv[i]=nv[i]+ex;
    }
    qsumv=vload(qv);return vload(yv);
}
static FracTriple frac_state_vector(const RnsEngine&e,const FastState&s,const std::vector<uint64_t>&cf,int maxlayers=12){
    FracTriple out;int k=s.k,packs=(k+7)/8;std::vector<V8> nu(packs),nv(packs),ns(packs);
    for(int pk=0;pk<packs;pk++){
        const auto&q=e.pc[pk];const auto&z=s.pack[pk];V8 sv=VMod::mul(z.A,z.H[s.st.high],q.vp,q.vc);V8 xv=VMod::sub(z.rankR,z.O,q.vp);
        V8 uv=VMod::sub(xv,vsmall(1),q.vp),vv=VMod::sub(sv,xv,q.vp);
        int base=pk*8,avail=std::min(8,k-base);V8 cv=vmaskload(avail,cf.data()+base);
        nu[pk]=VMod::mul(uv,cv,q.vp,q.vc);nv[pk]=VMod::mul(vv,cv,q.vp,q.vc);ns[pk]=VMod::mul(sv,cv,q.vp,q.vc);
    }
    std::array<bool,3> seen{false,false,false},done{false,false,false};std::array<int,3> sig{0,0,0};std::array<long double,3> val{0,0,0};
    for(int layer=0;layer<maxlayers;layer++){
        uint64_t sumq[3]{0,0,0};long double sum[3]{0,0,0},corr[3]{0,0,0};
        for(int pk=0;pk<packs;pk++){
            const auto&q=e.pc[pk];V8 qu,qv,qs;nu[pk]=frac_digit_step(nu[pk],q,qu);nv[pk]=frac_digit_step(nv[pk],q,qv);ns[pk]=frac_digit_step(ns[pk],q,qs);
            int base=pk*8,avail=std::min(8,k-base);alignas(64)uint64_t yu[8],yv[8],ys[8],xu[8],xv[8],xs[8];
            vstore(yu,nu[pk]);vstore(yv,nv[pk]);vstore(ys,ns[pk]);vstore(xu,qu);vstore(xv,qv);vstore(xs,qs);
            for(int l=0;l<avail;l++){sumq[0]+=xu[l];sumq[1]+=xv[l];sumq[2]+=xs[l];long double terms[3]={(long double)yu[l]*e.invp[base+l],(long double)yv[l]*e.invp[base+l],(long double)ys[l]*e.invp[base+l]};for(int a=0;a<3;a++){long double yy=terms[a]-corr[a],tt=sum[a]+yy;corr[a]=(tt-sum[a])-yy;sum[a]=tt;}}
        }
        FracAdaptive* rr[3]={&out.u,&out.v,&out.s};bool all=true;
        for(int a=0;a<3;a++){if(done[a])continue;uint64_t carry=(uint64_t)floorl(sum[a]+1e-18L);uint64_t dig=(sumq[a]+carry)&MASK52;rr[a]->layers=layer+1;if(dig){if(!seen[a])rr[a]->firstnz=layer+1;seen[a]=true;sig[a]++;}else if(seen[a])sig[a]++;val[a]+=scalbnl((long double)dig,-32*(layer+1));if(seen[a]&&sig[a]>=3)done[a]=true;if(!done[a])all=false;}
        for(int a=0;a<3;a++)if(!done[a])all=false;
        if(all)break;
    }
    FracAdaptive* rr[3]={&out.u,&out.v,&out.s};for(int a=0;a<3;a++){rr[a]->value=val[a];if(!seen[a])rr[a]->ok=false;}return out;
}

static void set_rank_resid(const RnsEngine&e,FastState&s){int packs=(s.k+7)/8;for(int pk=0;pk<packs;pk++){alignas(64)uint64_t rr[8]{};for(int l=0;l<8;l++){int i=pk*8+l;if(i<e.npr)rr[l]=mpz_fdiv_ui(s.rank.get_mpz_t(),e.primes[i]);}s.pack[pk].rankR=vload(rr);s.pack[pk].O=vzero();}}

static inline V8 replay_B(const RnsEngine&e,const PackConst&q,const PackState&z,int h,int d){if(h>=e.m-1)return vzero();int Rh=e.pref[h]-d;if(Rh<0)return vzero();if(e.commonFreq>1&&e.len[h+1]==e.commonN)return q.bcommon[Rh];return z.B[h];}
static inline V8 ratio_prod4(const PackConst&q,const StepMeta&x,int from,int to){ // inclusive j range
    V8 a0=vsmall(1),a1=vsmall(1),a2=vsmall(1),a3=vsmall(1);int z=0;
    for(int j=from;j<=to;j++,z++){uint64_t num=x.cum[j],den=(uint64_t)x.cum[j+1]-1;auto f=VMod::mul_small(q.inv[den],num,q.vp,q.vc);switch(z&3){case 0:a0=VMod::mul(a0,f,q.vp,q.vc);break;case 1:a1=VMod::mul(a1,f,q.vp,q.vc);break;case 2:a2=VMod::mul(a2,f,q.vp,q.vc);break;default:a3=VMod::mul(a3,f,q.vp,q.vc);break;}}
    auto b0=VMod::mul(a0,a1,q.vp,q.vc),b1=VMod::mul(a2,a3,q.vp,q.vc);return VMod::mul(b0,b1,q.vp,q.vc);
}
static void replay_pack(const RnsEngine&e,PackState&z,int pk,const std::vector<StepMeta>&steps){const auto&q=e.pc[pk];for(const auto&x:steps){V8 activeH;if(x.high>=e.m-1)activeH=z.H[x.high];else{auto bh=replay_B(e,q,z,x.high,x.d);auto ot=VMod::mul(bh,z.H[x.high+1],q.vp,q.vc);activeH=VMod::sub(z.H[x.high],ot,q.vp);}if(x.open){auto before=VMod::mul(z.A,activeH,q.vp,q.vc);z.O=VMod::add(z.O,before,q.vp);auto bh=replay_B(e,q,z,x.high,x.d);z.A=VMod::mul(z.A,bh,q.vp,q.vc);}else{
            V8 Ck=z.A,Cprev=vzero();int k=x.chosen;if(k<x.high){auto rat=ratio_prod4(q,x,k,x.high-1);Ck=VMod::mul(z.A,rat,q.vp,q.vc);}if(k>x.low){int j=k-1;uint64_t num=x.cum[j],den=(uint64_t)x.cum[j+1]-1;auto f=VMod::mul_small(q.inv[den],num,q.vp,q.vc);Cprev=VMod::mul(Ck,f,q.vp,q.vc);}auto before=VMod::mul(Cprev,activeH,q.vp,q.vc);z.O=VMod::add(z.O,before,q.vp);z.A=VMod::sub(Ck,Cprev,q.vp);
            for(int h=x.high;h<e.m-1;h++){auto bh=replay_B(e,q,z,h,x.d);auto term=VMod::mul(bh,z.H[h+1],q.vp,q.vc);z.H[h]=VMod::sub(z.H[h],term,q.vp);}for(int h=x.high;h<e.m-1;h++){int Rh=e.pref[h]-x.d,n=e.len[h+1];if(e.commonFreq>1&&n==e.commonN){z.B[h]=(Rh<=0)?vzero():q.bcommon[Rh-1];continue;}if(Rh<=0)z.B[h]=vzero();else{z.B[h]=VMod::mul_small(z.B[h],Rh,q.vp,q.vc);z.B[h]=VMod::mul(z.B[h],q.inv[Rh+n-2],q.vp,q.vc);}}
        }} }


struct ReplayPool{
    const RnsEngine& e; int nth; std::barrier<> bar; std::vector<std::thread> workers; std::atomic<uint64_t> gen{0}; std::atomic<bool> stop{false};
    std::vector<PackState>* packs=nullptr; const std::vector<StepMeta>* steps=nullptr; int active=0;
    explicit ReplayPool(const RnsEngine&ee,int n):e(ee),nth(std::max(1,n)),bar(nth){for(int tid=1;tid<nth;tid++)workers.emplace_back([this,tid]{uint64_t seen=0;for(;;){uint64_t g;while((g=gen.load(std::memory_order_acquire))==seen){if(stop.load(std::memory_order_relaxed))return;_mm_pause();}seen=g;if(stop.load(std::memory_order_relaxed))return;auto *pp=packs;auto *ss=steps;int aa=active;for(int pk=tid;pk<aa;pk+=nth)replay_pack(e,(*pp)[pk],pk,*ss);bar.arrive_and_wait();}});}
    ~ReplayPool(){stop.store(true,std::memory_order_relaxed);gen.fetch_add(1,std::memory_order_release);for(auto&t:workers)t.join();}
    void submit(std::vector<PackState>&p,const std::vector<StepMeta>&s,int activePacks){packs=&p;steps=&s;active=activePacks;gen.fetch_add(1,std::memory_order_release);for(int pk=0;pk<activePacks;pk+=nth)replay_pack(e,p[pk],pk,s);bar.arrive_and_wait();}
};

struct Stats{uint64_t cert=0,splits=0,fallback=0,failed=0,spec=0,waste=0,discard=0,micro=0,invalid=0,forced=0;double pred_ms=0,replay_ms=0,reset_ms=0,crt_ms=0,fallback_ms=0,total_ms=0;int minbasis=9999,maxbasis=0,maxlayers=0,reset_minbasis=9999,reset_maxbasis=0;uint64_t basis_samples=0,basis_sum=0,layers_sum=0,reset_basis_sum=0,reset_basis_samples=0;long double max_reset_err=0;};

struct Unknown{
    const RnsEngine&e;const ApproxTable&ap;const ExactTable&goldtab;const std::vector<int>&gold;ReplayPool&pool;int superblock;Stats st;std::vector<int> out;
    void basis_stat(int k){st.minbasis=std::min(st.minbasis,k);st.maxbasis=std::max(st.maxbasis,k);st.basis_sum+=k;st.basis_samples++;}
    bool certify_commit(FastState&s){std::vector<uint64_t>O,S;gather_vals(e,s,O,S);mpz_class o,ss;auto a=Clock::now();e.crt2(O,S,s.k,o,ss);auto b=Clock::now();st.crt_ms+=ms(a,b);st.cert++;bool pass=(o<s.rank && s.rank<=o+ss);if(!pass)return false;s.rank-=o;s.total=ss;int oldk=s.k,newk=e.basis_for(ss,oldk);for(int pk=0;pk<(oldk+7)/8;pk++){auto&q=e.pc[pk];s.pack[pk].rankR=VMod::sub(s.pack[pk].rankR,s.pack[pk].O,q.vp);s.pack[pk].O=vzero();}if(newk<oldk){shrink_coeff(e,s.coeff,oldk,newk);s.k=newk;}basis_stat(s.k);return true;}
    bool uv_reset(FastState&s,Predictor&p,int& resetK,std::vector<uint64_t>&resetCoeff){int bound=e.predictor_basis(s.st,s.k);int targetK=std::min(resetK,bound);if(targetK<resetK){shrink_coeff(e,resetCoeff,resetK,targetK);resetK=targetK;}int oldk=s.k;s.k=resetK;st.reset_minbasis=std::min(st.reset_minbasis,resetK);st.reset_maxbasis=std::max(st.reset_maxbasis,resetK);st.reset_basis_sum+=resetK;st.reset_basis_samples++;auto a=Clock::now();auto ft=frac_state_vector(e,s,resetCoeff,12);auto b=Clock::now();s.k=oldk;auto &fu=ft.u;auto &fv=ft.v;auto &fs=ft.s;st.reset_ms+=ms(a,b);st.micro++;st.maxlayers=std::max({st.maxlayers,fu.layers,fv.layers,fs.layers});st.layers_sum+=fu.layers+fv.layers+fs.layers;if(!fu.ok||!fv.ok||!fs.ok||!(fs.value>0)){st.invalid++;return false;}long double u=fu.value/fs.value,v=fv.value/fs.value;if(!std::isfinite(u)||!std::isfinite(v)||u<0||v<0||u>1.0000000001L||v>1.0000000001L){st.invalid++;return false;}p.reset_uv(u,v);int drop=std::max(0,fs.firstnz-1);int nk=std::max(1,resetK-drop);if(nk<resetK){shrink_coeff(e,resetCoeff,resetK,nk);resetK=nk;}return p.ok;}
    std::vector<int> legal(const StructState&s){std::vector<int>v;for(int m=s.low;m<=s.high;m++)if(!(s.rem[m]==1&&m!=s.low))v.push_back(m);if(s.high+1<e.m)v.push_back(s.high+1);return v;}
    void exact_leaf(FastState&s){auto t0=Clock::now();auto labs=legal(s.st);for(int lab:labs){FastState c=s;StructState meta=c.st;std::vector<StepMeta> sm{make_meta_and_apply(meta,e.len,e.pref,lab)};auto r0=Clock::now();int packs=(c.k+7)/8;pool.submit(c.pack,sm,packs);auto r1=Clock::now();st.replay_ms+=ms(r0,r1);c.st=meta;if(certify_commit(c)){s=std::move(c);out.push_back(lab);st.fallback++;st.fallback_ms+=ms(t0,Clock::now());return;}}
        throw std::runtime_error("leaf no exact branch");}
    void process(FastState&s,int len){if(len<=0)return;FastState snap=s;int startpos=s.st.pos;Predictor p;p.tab=&ap;p.reset(s.st,s.rank,s.total);std::vector<int>labels;labels.reserve(len);bool good=p.ok;StructState meta=s.st;int resetK=s.k;std::vector<uint64_t> resetCoeff=s.coeff;while(good&&(int)labels.size()<len){int chunk=std::min(8,len-(int)labels.size());std::vector<StepMeta> sm;sm.reserve(chunk);for(int i=0;i<chunk;i++){auto a=Clock::now();int lab=p.step();auto b=Clock::now();st.pred_ms+=ms(a,b);if(lab<0){good=false;st.invalid++;break;}labels.push_back(lab);st.spec++;sm.push_back(make_meta_and_apply(meta,e.len,e.pref,lab));}if(!good)break;auto r0=Clock::now();int packs=(s.k+7)/8;pool.submit(s.pack,sm,packs);auto r1=Clock::now();st.replay_ms+=ms(r0,r1);s.st=meta;if((int)labels.size()<len){if(!uv_reset(s,p,resetK,resetCoeff)){good=false;break;}}}
        st.forced+=p.forced;if(!good||(int)labels.size()!=len){st.failed++;st.waste+=labels.size();s=std::move(snap);if(len==1){exact_leaf(s);return;}st.splits++;int a=len/2;process(s,a);process(s,len-a);return;}
        if(certify_commit(s)){out.insert(out.end(),labels.begin(),labels.end());return;}
        st.failed++;st.waste+=len;int lcp=0;while(lcp<len&&startpos+lcp<(int)gold.size()&&labels[lcp]==gold[startpos+lcp])lcp++;st.discard+=len-lcp;s=std::move(snap);if(len==1){exact_leaf(s);return;}st.splits++;int a=len/2;process(s,a);process(s,len-a);
    }
    bool run(FastState&s,int stoppos=-1){out.clear();out.push_back(0);auto a=Clock::now();int totalpos=stoppos<0?(int)gold.size():std::min(stoppos,(int)gold.size());while(s.st.pos<totalpos){int n=std::min(superblock,totalpos-s.st.pos);process(s,n);}auto b=Clock::now();st.total_ms=ms(a,b);bool same=true;for(int i=0;i<totalpos;i++)if(out[i]!=gold[i]){same=false;break;}return same;}
};

// Gold exact oracle unranking for validation only.
struct GState{int pos=1,low=0,high=0,R=0;std::vector<int>rem;mpz_class A=1,rank;};
static std::vector<int> gold_word(const ExactTable&T,mpz_class rank){int total=std::accumulate(T.len.begin(),T.len.end(),0);std::vector<int>w;w.reserve(total);w.push_back(0);GState s;s.rem=T.len;s.rem[0]--;s.R=s.rem[0];s.rank=rank;while(s.pos<total){int span=s.high-s.low+1;std::vector<int>pre(span);int run=0;for(int i=s.low;i<=s.high;i++){run+=s.rem[i];pre[i-s.low]=run;}std::vector<mpz_class>sp(span+1,1),sm(span+1,1);for(int o=span-1;o>=0;o--){sp[o]=sp[o+1]*pre[o];sm[o]=sm[o+1]*(pre[o]-1);}const mpz_class futureSame=s.high<T.m-1?T.f[s.high][s.R]:mpz_class(1);bool sel=false;for(int month=s.low;month<=s.high;month++){int rf=s.rem[month];if(rf==1&&month!=s.low)continue;int off=month-s.low;mpz_class num,den;if(rf>1){num=mpz_class(rf-1)*sp[off];den=mpz_class(s.R)*sm[off];}else{num=sp[off+1];den=mpz_class(s.R)*sm[off+1];}mpz_class na=s.A*num;mpz_divexact(na.get_mpz_t(),na.get_mpz_t(),den.get_mpz_t());mpz_class block=na*futureSame;if(s.rank>block){s.rank-=block;continue;}s.A=na;s.rem[month]--;s.R--;if(s.rem[month]==0)s.low++;w.push_back(month);s.pos++;sel=true;break;}if(sel)continue;int month=s.high+1,nr=T.len[month]-1;mpz_class coeff;mpz_bin_uiui(coeff.get_mpz_t(),s.R+nr-1,nr-1);mpz_class na=s.A*coeff;int nR=s.R+nr;mpz_class fut=month<T.m-1?T.f[month][nR+1]:mpz_class(1);mpz_class block=na*fut;if(s.rank>block)throw std::runtime_error("gold open exhausted");s.A=na;s.high=month;s.rem[month]--;s.R=nR;w.push_back(month);s.pos++;}return w;}

static bool validate_count(const RnsEngine&e,const ExactTable&T){size_t bad=0;for(int i=0;i<e.npr;i++){uint64_t want=mpz_fdiv_ui(T.N.get_mpz_t(),e.primes[i]);if(e.Nres[i]!=want){if(bad<4)std::cerr<<"bad N residue "<<i<<"\n";bad++;}}mpz_class rec=e.crt(e.Nres,e.npr);std::cerr<<"count_validation bad="<<bad<<" rec_eq="<<(rec==T.N)<<" Nbits="<<mpz_sizeinbase(T.N.get_mpz_t(),2)<<" Pbits="<<mpz_sizeinbase(e.Pprefix[e.npr].get_mpz_t(),2)<<"\n";return bad==0&&rec==T.N;}
static bool validate_frac(const RnsEngine&e,int k,const std::vector<uint64_t>&coeff){gmp_randclass rr(gmp_randinit_mt);rr.seed(99117);long double mx=0;for(int t=0;t<100;t++){mpz_class x=rr.get_z_range(e.Pprefix[k]);std::vector<uint64_t>r(k);for(int i=0;i<k;i++)r[i]=mpz_fdiv_ui(x.get_mpz_t(),e.primes[i]);auto f=frac3(e,r,coeff,k);long double ex=mpz_ratio_ld(x,e.Pprefix[k]);long double er=fabsl(f.value-ex);mx=std::max(mx,er);if(!f.ok||er>5e-19L){std::cerr<<"frac bad t="<<t<<" err="<<(double)er<<" ex="<<(double)ex<<" got="<<(double)f.value<<"\n";return false;}}std::cerr<<"frac3_validation max_abs="<<std::setprecision(5)<<std::scientific<<(double)mx<<std::defaultfloat<<"\n";return true;}

int main(int argc,char**argv){int threads=std::min(5,omp_get_max_threads());int randoms=3;if(argc>1)threads=atoi(argv[1]);if(argc>2)randoms=atoi(argv[2]);std::vector<int>len(47,123);len.back()=120;auto g0=Clock::now();ExactTable gt(len);auto g1=Clock::now();auto a0=Clock::now();ApproxTable ap(len);auto a1=Clock::now();auto r0=Clock::now();RnsEngine eng(len,1008,threads);auto r1=Clock::now();bool cok=validate_count(eng,gt);mpz_class N=eng.crt(eng.Nres,eng.npr);int initk=eng.basis_for(N,eng.npr);auto c0=Clock::now();auto coeff=init_coeff(eng,initk);auto c1=Clock::now();bool fok=validate_frac(eng,initk,coeff);std::cerr<<"setup exact_gold_table_ms="<<ms(g0,g1)<<" approx_table_ms="<<ms(a0,a1)<<" rns_ctor_ms="<<ms(r0,r1)<<" rns_count_ms="<<eng.count_ms<<" fracmeta_ms="<<eng.fracmeta_ms<<" init_basis="<<initk<<" coeff_ms="<<ms(c0,c1)<<" count_ok="<<cok<<" frac_ok="<<fok<<"\n";
    ReplayPool pool(eng,threads);
    std::vector<std::pair<std::string,mpz_class>> ranks;ranks.push_back({"mid",N/2});gmp_randclass rr(gmp_randinit_mt);rr.seed(0xC01DCAFE);for(int i=0;i<randoms;i++)ranks.push_back({"rnd"+std::to_string(i+1),rr.get_z_range(N)+1});
    std::cout<<"rank,superblock,ok,unknown_ms,cert,splits,fallback,failed,spec,waste,discard,micro,invalid,forced,pred_ms,replay_ms,reset_ms,crt_ms,fallback_ms,minbasis,maxbasis,avgbasis,maxlayers,avglayers,reset_minbasis,reset_maxbasis,reset_avgbasis\n";
    for(auto& [name,rank]:ranks){auto w0=Clock::now();auto gold=gold_word(gt,rank);auto w1=Clock::now();std::cerr<<"gold "<<name<<" ms="<<ms(w0,w1)<<"\n";for(int sb:{64,128,256,512}){FastState s;s.st=initial_struct(len);s.pack=eng.initPacks;s.k=initk;s.coeff=coeff;s.rank=rank;s.total=N;set_rank_resid(eng,s);Unknown u{eng,ap,gt,gold,pool,sb};bool ok=u.run(s);auto&z=u.st;double avg=z.basis_samples?(double)z.basis_sum/z.basis_samples:0;std::cout<<name<<","<<sb<<","<<ok<<","<<std::fixed<<std::setprecision(6)<<z.total_ms<<","<<z.cert<<","<<z.splits<<","<<z.fallback<<","<<z.failed<<","<<z.spec<<","<<z.waste<<","<<z.discard<<","<<z.micro<<","<<z.invalid<<","<<z.forced<<","<<z.pred_ms<<","<<z.replay_ms<<","<<z.reset_ms<<","<<z.crt_ms<<","<<z.fallback_ms<<","<<z.minbasis<<","<<z.maxbasis<<","<<avg<<","<<z.maxlayers<<","<<(z.micro?(double)z.layers_sum/(3.0*z.micro):0.0)<<","<<(z.reset_basis_samples?z.reset_minbasis:0)<<","<<z.reset_maxbasis<<","<<(z.reset_basis_samples?(double)z.reset_basis_sum/z.reset_basis_samples:0.0)<<"\n";}}
}
