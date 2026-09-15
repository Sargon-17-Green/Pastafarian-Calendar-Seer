#define main rns_year_batch_disabled_main
#include "rns_micro8_avx2_32x8.cpp"
#undef main
#define main year_fast_year_batch_disabled_main
#include "year_fast_bench_v12.cpp"
#undef main

#include <boost/multiprecision/cpp_int.hpp>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>
using BI=boost::multiprecision::cpp_int;

static BI yb_fu_to_bi(U128 x){BI z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static mpz_class yb_fu_to_mpz(U128 x){mpz_class z=(uint64_t)(x>>64);z<<=64;z+=(uint64_t)x;return z;}
static BI yb_fast_choose_bi(const FSauce&so,int bowl,uint64_t seal,const BI&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);BI MM=yb_fu_to_bi(F127_M);
    if(n<=MM){BI lim=(MM/n)*n;U128 c=frep(d.first);while(yb_fu_to_bi(c)>lim)c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);if(widthOut)*widthOut=1;return (yb_fu_to_bi(c)-1)%n+1;}
    int width=1;BI space=MM;while(space<n){space*=MM;width++;}BI wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(yb_fu_to_bi(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}BI lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?BI(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}
static mpz_class yb_fast_choose_mpz(const FSauce&so,int bowl,uint64_t seal,const mpz_class&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("n<=0");auto d=fast_desc(so,bowl,seal);mpz_class MM=yb_fu_to_mpz(F127_M);
    if(n<=MM){mpz_class lim=(MM/n)*n;U128 c=frep(d.first);while(yb_fu_to_mpz(c)>lim)c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);if(widthOut)*widthOut=1;return (yb_fu_to_mpz(c)-1)%n+1;}
    int width=1;mpz_class space=MM;while(space<n){space*=MM;width++;}mpz_class wf=1,w=1;U128 rr=d.first;for(int off=0;off<width;off++){wf+=(yb_fu_to_mpz(frep(rr))-1)*w;w*=MM;U128 c=frep(rr);c=d.forward?(c==F127_M?1:c+1):(c==1?F127_M:c-1);rr=(c==F127_M?0:c);}mpz_class lim=(space/n)*n,acc=wf;if(acc>lim)acc=d.forward?mpz_class(1):lim;if(widthOut)*widthOut=width;return (acc-1)%n+1;
}

static BI yb_binom_bi(int n,int k){if(n<0||k<0||k>n)return 0;k=std::min(k,n-k);BI r=1;for(int i=1;i<=k;i++){r*=n-k+i;r/=i;}return r;}
static BI yb_perm_bi(int n,int k){BI r=1;for(int x=n-k+1;x<=n;x++)r*=x;return r;}
static std::vector<int> yb_unrank_names_idx(int n,int k,BI rank){rank-=1;std::vector<int>a(n),out;std::iota(a.begin(),a.end(),0);out.reserve(k);for(int pos=0;pos<k;pos++){BI block=yb_perm_bi((int)a.size()-1,k-pos-1);BI q=rank/block;rank%=block;int ix=q.convert_to<int>();out.push_back(a[ix]);a.erase(a.begin()+ix);}return out;}
static BI yb_comp_suffix(int rem,int parts,int mandatoryOffset){if(parts==0)return(rem==0&&(mandatoryOffset<0||mandatoryOffset==0))?BI(1):BI(0);if(rem<parts)return 0;if(mandatoryOffset<0||mandatoryOffset==0)return yb_binom_bi(rem-1,parts-1);if(mandatoryOffset<=0||mandatoryOffset>=rem||parts<2)return 0;return yb_binom_bi(rem-2,parts-2);}
static std::vector<int> yb_unrank_comp(int total,int parts,int mandatory,BI rank){int rem=total,cum=0;bool hit=mandatory<0;std::vector<int>out;out.reserve(parts);for(int pos=0;pos<parts;pos++){int left=parts-pos-1;bool sel=false;for(int val=1;val<=rem-left;val++){int after=rem-val,ncum=cum+val;bool nhit=hit||(mandatory>=0&&ncum==mandatory);int mo=-1;if(!nhit){if(mandatory<0||mandatory<ncum)continue;mo=mandatory-ncum;}BI block=yb_comp_suffix(after,left,nhit?-1:mo);if(rank>block){rank-=block;continue;}out.push_back(val);rem=after;cum=ncum;hit=nhit;sel=true;break;}if(!sel)throw std::runtime_error("composition rank exhausted");}return out;}

struct YBU320{std::array<uint64_t,5>w{};};
static inline void yb_uadd(YBU320&a,const YBU320&b){unsigned __int128 c=0;for(int i=0;i<5;i++){unsigned __int128 z=(unsigned __int128)a.w[i]+b.w[i]+c;a.w[i]=(uint64_t)z;c=z>>64;}if(c)throw std::overflow_error("U320 add overflow");}
static inline void yb_usub(YBU320&a,const YBU320&b){uint64_t borrow=0;for(int i=0;i<5;i++){uint64_t bi=b.w[i],ai=a.w[i];uint64_t t=ai-bi;uint64_t b1=ai<bi;uint64_t t2=t-borrow;uint64_t b2=t<borrow;a.w[i]=t2;borrow=b1|b2;}if(borrow)throw std::underflow_error("U320 sub underflow");}
static inline int yb_ucmp(const YBU320&a,const YBU320&b){for(int i=4;i>=0;i--)if(a.w[i]!=b.w[i])return a.w[i]<b.w[i]?-1:1;return 0;}
static YBU320 yb_bi_to_u320(BI x){if(x<0)throw std::runtime_error("negative U320");YBU320 a;BI mask=(BI(1)<<64)-1;for(int i=0;i<5;i++){a.w[i]=(x&mask).convert_to<uint64_t>();x>>=64;}if(x!=0)throw std::overflow_error("BI > U320");return a;}
static BI yb_u320_to_bi(const YBU320&a){BI x=0;for(int i=4;i>=0;i--){x<<=64;x+=a.w[i];}return x;}
struct YBMonthCountTable{
    std::array<std::vector<YBU320>,48>f;
    YBMonthCountTable(){
        f[0].resize(1);f[0][0].w[0]=1;
        for(int p=1;p<=47;p++){
            int maxShift=119*p,half=maxShift/2;f[p].resize(half+1);YBU320 win{};
            auto prev=[&](int sh)->const YBU320&{
                static const YBU320 Z{};int pm=119*(p-1);
                if(sh<0||sh>pm)return Z;int q=std::min(sh,pm-sh);return f[p-1][q];
            };
            for(int sh=0;sh<=half;sh++){
                yb_uadd(win,prev(sh));if(sh>=120)yb_usub(win,prev(sh-120));f[p][sh]=win;
            }
        }
    }
    const YBU320&at(int p,int sum)const{
        static const YBU320 Z{};
        if(p<0||p>47)return Z;
        if(p==0)return sum==0?f[0][0]:Z;
        int sh=sum-4*p,maxShift=119*p;
        if(sh<0||sh>maxShift)return Z;
        return f[p][std::min(sh,maxShift-sh)];
    }
};
static const YBMonthCountTable&yb_month_count_table(){
    static const YBMonthCountTable table;
    return table;
}
struct YBMonthDP{
    int total,parts;const YBMonthCountTable&table;
    YBMonthDP(int T,int P):total(T),parts(P),table(yb_month_count_table()){
        if(P<0||P>47)throw std::runtime_error("month parts outside 0..47");
    }
    const YBU320&at(int p,int sum)const{return table.at(p,sum);}
    BI count()const{return yb_u320_to_bi(at(parts,total));}
    std::vector<int>unrank(BI rankBI)const{
        YBU320 rank=yb_bi_to_u320(rankBI);int rem=total;std::vector<int>out;out.reserve(parts);
        for(int pos=0;pos<parts;pos++){
            int left=parts-pos-1,maxv=std::min(123,rem-4*left);bool sel=false;
            for(int v=4;v<=maxv;v++){
                int after=rem-v;const YBU320&block=at(left,after);
                if(yb_ucmp(rank,block)>0){yb_usub(rank,block);continue;}
                out.push_back(v);rem=after;sel=true;break;
            }
            if(!sel)throw std::runtime_error("month rank exhausted");
        }
        return out;
    }
};

struct YBStructResult{int cutletCount,monthCount;std::vector<int>cutGaps,cutName,cutStart,cutEnd,monthLen,monthName;};
static YBStructResult yb_build_nonweave(int64_t calc,const FGates&G,const FY&y,const FSauce&so){
    YBStructResult r;int yearLen=(int)(y.b-y.a),gapCount=y.c-y.o;
    int cmax=std::min(17,gapCount),opts=cmax-5;BI ccRank=yb_fast_choose_bi(so,2,20,BI(opts));r.cutletCount=5+ccRank.convert_to<int>();
    int mandatory=-1;if(calc>=y.a+1&&calc<=y.b){for(int gi=y.o+1;gi<y.c;gi++)if(G.at(gi)==calc){mandatory=gi-y.o;break;}}
    BI pc=mandatory<0?yb_binom_bi(gapCount-1,r.cutletCount-1):yb_binom_bi(gapCount-2,r.cutletCount-2);BI prank=yb_fast_choose_bi(so,2,21,pc);r.cutGaps=yb_unrank_comp(gapCount,r.cutletCount,mandatory,prank);
    BI cn=yb_perm_bi(17,r.cutletCount);BI cr=yb_fast_choose_bi(so,5,22,cn);r.cutName=yb_unrank_names_idx(17,r.cutletCount,cr);
    int minM=(yearLen+122)/123,maxM=std::min(47,yearLen/4);BI mcRank=yb_fast_choose_bi(so,3,30,BI(maxM-minM+1));r.monthCount=minM+mcRank.convert_to<int>()-1;
    YBMonthDP md(yearLen,r.monthCount);BI mlN=md.count();BI mlR=yb_fast_choose_bi(so,3,31,mlN);r.monthLen=md.unrank(mlR);
    BI mn=yb_perm_bi(47,r.monthCount);BI mr=yb_fast_choose_bi(so,5,33,mn);r.monthName=yb_unrank_names_idx(47,r.monthCount,mr);
    int gapOff=0,dayOff=0;for(int cg:r.cutGaps){r.cutStart.push_back(dayOff);gapOff+=cg;int64_t end=G.at(y.o+gapOff);dayOff=(int)(end-(y.a+1)+1);r.cutEnd.push_back(dayOff-1);}return r;
}
static int yb_conservative_npr(const std::vector<int>&len){int total=std::accumulate(len.begin(),len.end(),0);long double ln=lgammal((long double)total+1);for(int x:len)ln-=lgammal((long double)x+1);long double bits=ln/logl(2.0L);int k=(int)ceill((bits+32.0L)/31.9L)+2;return std::clamp(k,8,1050);}

struct BatchRecord{int64_t targetJdn=0;long long year=0;int cutletIndex=0,dayInCutlet=0,monthIndex=0,dayInMonth=0,cutletCount=0,monthCount=0;};

template<class Stones>
static std::vector<BatchRecord> compute_segment(int64_t calc,int64_t first,int64_t last,const FGates&G,const Stones&S,const FY&y,int threads,int sb,int replayThreads){
    if(first<y.a+1||last>y.b||first>last)throw std::runtime_error("invalid year segment");
    FSauce structSauce=fast_sauce(calc,y.a+1,S);YBStructResult st=yb_build_nonweave(calc,G,y,structSauce);
    int maxOffset=(int)(last-(y.a+1));
    int npr=yb_conservative_npr(st.monthLen);RnsEngine eng(st.monthLen,npr,threads);mpz_class N=eng.crt(eng.Nres,eng.npr);
    int initk=eng.basis_for(N,eng.npr);auto coeff=init_coeff(eng,initk);int width=0;mpz_class rank=yb_fast_choose_mpz(structSauce,4,32,N,&width);
    ExactTable gtDummy(std::vector<int>{1});std::vector<int>dummyGold(std::accumulate(st.monthLen.begin(),st.monthLen.end(),0),-1);dummyGold[0]=0;
    ApproxTable ap(st.monthLen);ReplayPool pool(eng,replayThreads);FastState fs;fs.st=initial_struct(st.monthLen);fs.pack=eng.initPacks;fs.k=initk;fs.coeff=coeff;fs.rank=rank;fs.total=N;set_rank_resid(eng,fs);Unknown u{eng,ap,gtDummy,dummyGold,pool,sb};u.run(fs,maxOffset+1);
    if((int)u.out.size()<=maxOffset)throw std::runtime_error("weave prefix shorter than requested segment");
    std::vector<int>seen(st.monthCount,0);std::vector<BatchRecord>out;out.reserve((size_t)(last-first+1));
    for(int offset=0;offset<=maxOffset;offset++){
        int mi=u.out[offset];if(mi<0||mi>=st.monthCount)throw std::runtime_error("invalid month index from weave");int dim=++seen[mi];
        int64_t target=y.a+1+offset;if(target<first)continue;
        int ci=-1;for(int i=0;i<st.cutletCount;i++)if(offset>=st.cutStart[i]&&offset<=st.cutEnd[i]){ci=i;break;}if(ci<0)throw std::runtime_error("cutlet lost");
        BatchRecord r;r.targetJdn=target;r.year=(long long)y.num;r.cutletIndex=st.cutName[ci];r.dayInCutlet=offset-st.cutStart[ci]+1;r.monthIndex=st.monthName[mi];r.dayInMonth=dim;r.cutletCount=st.cutletCount;r.monthCount=st.monthCount;out.push_back(r);
    }
    return out;
}

#ifndef SEER_YEAR_BATCH_NO_MAIN
int main(int argc,char**argv){
    try{
        if(argc<4){std::cerr<<"usage: seer_year_batch <calc_jdn> <target_start_jdn> <count> [threads] [superblock] [replay_threads]\n";return 2;}
        int64_t calc=std::stoll(argv[1]),targetStart=std::stoll(argv[2]);long long count=std::stoll(argv[3]);if(count<=0||count>10000)throw std::runtime_error("count must be in 1..10000");
        int threads=argc>4?atoi(argv[4]):3,sb=argc>5?atoi(argv[5]):512,replayThreads=argc>6?atoi(argv[6]):threads;if(threads<1||replayThreads<1||sb<1)throw std::runtime_error("invalid execution parameters");
        if(count-1>std::numeric_limits<int64_t>::max()-targetStart)throw std::overflow_error("target range overflow");int64_t targetEnd=targetStart+(int64_t)count-1;
        FGates G("gates_u16.bin");auto S=fast_stones();FY y=fanchor(calc,G,S);while(targetStart<y.a+1)y=fadj(calc,G,S,y,false);while(targetStart>y.b)y=fadj(calc,G,S,y,true);
        std::vector<BatchRecord>records;records.reserve((size_t)count);int64_t cursor=targetStart;
        while(cursor<=targetEnd){int64_t segEnd=std::min<int64_t>(targetEnd,y.b);auto part=compute_segment(calc,cursor,segEnd,G,S,y,threads,sb,replayThreads);records.insert(records.end(),part.begin(),part.end());if(segEnd==targetEnd)break;cursor=segEnd+1;y=fadj(calc,G,S,y,true);}
        if(records.size()!=(size_t)count)throw std::runtime_error("batch record count mismatch");
        std::cout<<"{\"schema\":1,\"engine\":\"seer-v12-avx2-batch\",\"calcJdn\":"<<calc<<",\"targetStartJdn\":"<<targetStart<<",\"targetCount\":"<<count<<",\"records\":[";
        for(size_t i=0;i<records.size();i++){if(i)std::cout<<',';const auto&r=records[i];std::cout<<"{\"targetJdn\":"<<r.targetJdn<<",\"year\":"<<r.year<<",\"cutletIndex\":"<<r.cutletIndex<<",\"dayInCutlet\":"<<r.dayInCutlet<<",\"monthIndex\":"<<r.monthIndex<<",\"dayInMonth\":"<<r.dayInMonth<<",\"cutletCount\":"<<r.cutletCount<<",\"monthCount\":"<<r.monthCount<<'}';}
        std::cout<<"]}\n";return 0;
    }catch(const std::exception&e){std::cerr<<"seer_year_batch: "<<e.what()<<"\n";return 1;}
}
#endif
