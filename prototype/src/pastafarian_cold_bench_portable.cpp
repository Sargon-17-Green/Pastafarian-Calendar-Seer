// Portable entry point for the Seer cold-conversion benchmark.
// It differs from pastafarian_cold_bench.cpp only by selecting the portable RNS backend.

#define main rns_lazyfrac_disabled_main
#include "rns_micro8_portable.cpp"
#undef main
#define main year_fast_disabled_main
#include "year_fast_bench_v3.cpp"
#undef main

#include <boost/multiprecision/cpp_int.hpp>
#include <iomanip>
using BI=boost::multiprecision::cpp_int;
static BI fu_to_bi(U128 x){BI z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static mpz_class fu_to_mpz(U128 x){mpz_class z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static BI fast_choose_bi(const FSauce&so,int bowl,uint64_t seal,const BI&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);BI MM=fu_to_bi(F127_M);
    if(n<=MM){BI lim=(MM/n)*n;U128 c=frep(d.first);while(fu_to_bi(c)>lim)c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);if(widthOut)*widthOut=1;return (fu_to_bi(c)-1)%n+1;}
    int width=1;BI space=MM;while(space<n){space*=MM;width++;}BI wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(fu_to_bi(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}BI lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?BI(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}
static mpz_class fast_choose_mpz(const FSauce&so,int bowl,uint64_t seal,const mpz_class&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);mpz_class MM=fu_to_mpz(F127_M);
    if(n<=MM){mpz_class lim=(MM/n)*n;U128 c=frep(d.first);while(fu_to_mpz(c)>lim)c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);if(widthOut)*widthOut=1;return (fu_to_mpz(c)-1)%n+1;}
    int width=1;mpz_class space=MM;while(space<n){space*=MM;width++;}mpz_class wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(fu_to_mpz(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}mpz_class lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?mpz_class(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}

static BI binom_bi(int n,int k){
    if(n<0||k<0||k>n)return 0;k=std::min(k,n-k);BI r=1;
    for(int i=1;i<=k;i++){r*=n-k+i;r/=i;}return r;
}
static BI perm_bi(int n,int k){BI r=1;for(int x=n-k+1;x<=n;x++)r*=x;return r;}
static std::vector<int> unrank_names_idx(int n,int k,BI rank){
    rank-=1;std::vector<int>a(n),out;std::iota(a.begin(),a.end(),0);out.reserve(k);
    for(int pos=0;pos<k;pos++){BI block=perm_bi((int)a.size()-1,k-pos-1);BI q=rank/block;rank%=block;int ix=q.convert_to<int>();out.push_back(a[ix]);a.erase(a.begin()+ix);}return out;
}
static BI comp_suffix(int rem,int parts,int mandatoryOffset){
    if(parts==0)return (rem==0&&(mandatoryOffset<0||mandatoryOffset==0))?BI(1):BI(0);
    if(rem<parts)return 0;if(mandatoryOffset<0||mandatoryOffset==0)return binom_bi(rem-1,parts-1);
    if(mandatoryOffset<=0||mandatoryOffset>=rem||parts<2)return 0;return binom_bi(rem-2,parts-2);
}
static std::vector<int> unrank_comp(int total,int parts,int mandatory,BI rank){
    int rem=total,cum=0;bool hit=mandatory<0;std::vector<int>out;out.reserve(parts);
    for(int pos=0;pos<parts;pos++){int left=parts-pos-1;bool sel=false;for(int val=1;val<=rem-left;val++){
        int after=rem-val,ncum=cum+val;bool nhit=hit||(mandatory>=0&&ncum==mandatory);int mo=-1;
        if(!nhit){if(mandatory<0||mandatory<ncum)continue;mo=mandatory-ncum;}
        BI block=comp_suffix(after,left,nhit?-1:mo);if(rank>block){rank-=block;continue;}
        out.push_back(val);rem=after;cum=ncum;hit=nhit;sel=true;break;
    }if(!sel)throw std::runtime_error("composition rank exhausted");}return out;
}

struct U320{std::array<uint64_t,5> w{};};
static inline void uadd(U320&a,const U320&b){unsigned __int128 c=0;for(int i=0;i<5;i++){unsigned __int128 z=(unsigned __int128)a.w[i]+b.w[i]+c;a.w[i]=(uint64_t)z;c=z>>64;}if(c)throw std::overflow_error("U320 add overflow");}
static inline void usub(U320&a,const U320&b){uint64_t borrow=0;for(int i=0;i<5;i++){uint64_t bi=b.w[i],ai=a.w[i];uint64_t t=ai-bi;uint64_t b1=ai<bi;uint64_t t2=t-borrow;uint64_t b2=t<borrow;a.w[i]=t2;borrow=b1|b2;}if(borrow)throw std::underflow_error("U320 sub underflow");}
static inline int ucmp(const U320&a,const U320&b){for(int i=4;i>=0;i--)if(a.w[i]!=b.w[i])return a.w[i]<b.w[i]?-1:1;return 0;}
static U320 bi_to_u320(BI x){if(x<0)throw std::runtime_error("negative U320");U320 a;BI mask=(BI(1)<<64)-1;for(int i=0;i<5;i++){a.w[i]=(x&mask).convert_to<uint64_t>();x>>=64;}if(x!=0)throw std::overflow_error("BI > U320");return a;}
static BI u320_to_bi(const U320&a){BI x=0;for(int i=4;i>=0;i--){x<<=64;x+=a.w[i];}return x;}
struct MonthDP{
    int total,parts;std::vector<std::vector<U320>> f;
    MonthDP(int T,int P):total(T),parts(P),f(P+1){
        f[0].resize(1);f[0][0].w[0]=1;
        for(int p=1;p<=P;p++){
            int maxShift=119*p,half=maxShift/2;f[p].resize(half+1);U320 win{};
            auto prev=[&](int sh)->const U320&{static const U320 Z{};int pm=119*(p-1);if(sh<0||sh>pm)return Z;int q=std::min(sh,pm-sh);return f[p-1][q];};
            for(int sh=0;sh<=half;sh++){uadd(win,prev(sh));if(sh>=120)usub(win,prev(sh-120));f[p][sh]=win;}
        }
    }
    const U320& at(int p,int sum)const{static const U320 Z{};if(p==0)return sum==0?f[0][0]:Z;int sh=sum-4*p,maxShift=119*p;if(sh<0||sh>maxShift)return Z;return f[p][std::min(sh,maxShift-sh)];}
    U320 countU()const{return at(parts,total);}
    BI count()const{return u320_to_bi(countU());}
    std::vector<int> unrank(BI rankBI)const{U320 rank=bi_to_u320(rankBI);int rem=total;std::vector<int>out;out.reserve(parts);for(int pos=0;pos<parts;pos++){int left=parts-pos-1,maxv=std::min(123,rem-4*left);bool sel=false;for(int v=4;v<=maxv;v++){int after=rem-v;const U320& block=at(left,after);if(ucmp(rank,block)>0){usub(rank,block);continue;}out.push_back(v);rem=after;sel=true;break;}if(!sel)throw std::runtime_error("month rank exhausted");}return out;}
};



struct StructResult{int cutletCount,monthCount;std::vector<int> cutGaps,cutName,cutStart,cutEnd,monthLen,monthName;mpz_class weaveN,weaveRank;int weaveWidth=0;};

static StructResult build_nonweave(int64_t calc,const FGates&G,const FY&y,const FSauce&so){
    StructResult r;int yearLen=(int)(y.b-y.a),gapCount=y.c-y.o;
    int cmax=std::min(17,gapCount),opts=cmax-5;BI ccRank=fast_choose_bi(so,2,20,BI(opts));r.cutletCount=5+ccRank.convert_to<int>();
    int mandatory=-1;if(calc>=y.a+1&&calc<=y.b){for(int gi=y.o+1;gi<y.c;gi++)if(G.at(gi)==calc){mandatory=gi-y.o;break;}}
    BI pc=mandatory<0?binom_bi(gapCount-1,r.cutletCount-1):binom_bi(gapCount-2,r.cutletCount-2);BI prank=fast_choose_bi(so,2,21,pc);r.cutGaps=unrank_comp(gapCount,r.cutletCount,mandatory,prank);
    BI cn=perm_bi(17,r.cutletCount);BI cr=fast_choose_bi(so,5,22,cn);r.cutName=unrank_names_idx(17,r.cutletCount,cr);
    int minM=(yearLen+122)/123,maxM=std::min(47,yearLen/4);BI mcRank=fast_choose_bi(so,3,30,BI(maxM-minM+1));r.monthCount=minM+mcRank.convert_to<int>()-1;
    MonthDP md(yearLen,r.monthCount);BI mlN=md.count();BI mlR=fast_choose_bi(so,3,31,mlN);r.monthLen=md.unrank(mlR);
    BI mn=perm_bi(47,r.monthCount);BI mr=fast_choose_bi(so,5,33,mn);r.monthName=unrank_names_idx(47,r.monthCount,mr);
    int gapOff=0,dayOff=0;for(int cg:r.cutGaps){r.cutStart.push_back(dayOff);gapOff+=cg;int64_t end=G.at(y.o+gapOff);dayOff=(int)(end-(y.a+1)+1);r.cutEnd.push_back(dayOff-1);}return r;
}

static int conservative_npr(const std::vector<int>&len){
    int total=std::accumulate(len.begin(),len.end(),0);long double ln=lgammal((long double)total+1);for(int x:len)ln-=lgammal((long double)x+1);long double bits=ln/logl(2.0L);int k=(int)ceill((bits+32.0L)/51.9L)+2;return std::clamp(k,8,608);
}

int main(int argc,char**argv){
    if(argc<3){std::cerr<<"calc target [threads] [sb]\n";return 2;}int64_t calc=std::stoll(argv[1]),target=std::stoll(argv[2]);int threads=argc>3?atoi(argv[3]):3,sb=argc>4?atoi(argv[4]):512;
    FGates G("gates_u16.bin");auto S=fast_stones();auto ALL0=Clock::now();
    auto a0=Clock::now();FY y=fanchor(calc,G,S);auto a1=Clock::now();int steps=0;while(target<y.a+1){y=fadj(calc,G,S,y,false);steps++;}while(target>y.b){y=fadj(calc,G,S,y,true);steps++;}auto a2=Clock::now();
    auto s0=Clock::now();FSauce structSauce=fast_sauce(calc,y.a+1,S);StructResult st=build_nonweave(calc,G,y,structSauce);auto s1=Clock::now();int offset=(int)(target-(y.a+1));
    int npr=conservative_npr(st.monthLen);
    auto r0=Clock::now();RnsEngine eng(st.monthLen,npr,threads);auto r1=Clock::now();mpz_class N=eng.crt(eng.Nres,eng.npr);auto r2=Clock::now();
    int initk=eng.basis_for(N,eng.npr);auto coeff=init_coeff(eng,initk);auto r3=Clock::now();int width=0;mpz_class rank=fast_choose_mpz(structSauce,4,32,N,&width);auto r4=Clock::now();
    // Production-equivalent run: gold is not an authority and is omitted.
    ExactTable gtDummy(std::vector<int>{1});std::vector<int> dummyGold(std::accumulate(st.monthLen.begin(),st.monthLen.end(),0),-1);dummyGold[0]=0;
    auto u0=Clock::now();ApproxTable ap(st.monthLen);ReplayPool pool(eng,threads);FastState fs;fs.st=initial_struct(st.monthLen);fs.pack=eng.initPacks;fs.k=initk;fs.coeff=coeff;fs.rank=rank;fs.total=N;set_rank_resid(eng,fs);Unknown u{eng,ap,gtDummy,dummyGold,pool,sb};u.run(fs,offset+1);bool ok=true;auto u1=Clock::now();int mi=u.out[offset],dim=0;for(int i=0;i<=offset;i++)if(u.out[i]==mi)dim++;int ci=-1;for(int i=0;i<st.cutletCount;i++)if(offset>=st.cutStart[i]&&offset<=st.cutEnd[i]){ci=i;break;}if(ci<0)throw std::runtime_error("cutlet lost");
    auto ALL1=Clock::now();
    std::cout<<"year="<<y.num<<" steps="<<steps<<" gates="<<y.o<<":"<<y.c<<" len="<<(y.b-y.a)<<" offset="<<offset
             <<" cutlet_idx="<<st.cutName[ci]<<" day_cutlet="<<(offset-st.cutStart[ci]+1)<<" month_idx="<<st.monthName[mi]<<" day_month="<<dim
             <<" months="<<st.monthCount<<" npr="<<npr<<" Nbits="<<mpz_sizeinbase(N.get_mpz_t(),2)<<" width="<<width<<"\n";
    std::cout<<std::fixed<<std::setprecision(3)
             <<"ms anchor="<<ms(a0,a1)<<" walk="<<ms(a1,a2)<<" nonweave="<<ms(s0,s1)<<" rns_ctor="<<ms(r0,r1)<<" rns_count="<<eng.count_ms<<" rns_other="<<(ms(r0,r1)-eng.count_ms)<<" crtN="<<ms(r1,r2)<<" coeff="<<ms(r2,r3)<<" weave_choose="<<ms(r3,r4)
             <<" prefix_total="<<ms(u0,u1)<<" unknown_inner="<<u.st.total_ms<<" approx="<<(ms(u0,u1)-u.st.total_ms)
             <<" all="<<ms(ALL0,ALL1)<<" cert="<<u.st.cert<<" splits="<<u.st.splits<<" micro="<<u.st.micro<<" pred="<<u.st.pred_ms<<" replay="<<u.st.replay_ms<<" reset="<<u.st.reset_ms<<" ucrt="<<u.st.crt_ms<<" fallback="<<u.st.fallback_ms<<"\n";
}
