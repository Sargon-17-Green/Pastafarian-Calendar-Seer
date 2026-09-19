#include "seer_calendar_core.hpp"
#include "seer_month_dp_internal.hpp"
#include "seer_selection_core.hpp"
#include "seer_weave_core.hpp"
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <numeric>
#include <stdexcept>
#include <vector>
namespace seer_native::detail {
static BI yb_binom_bi(int n,int k){if(n<0||k<0||k>n)return 0;k=std::min(k,n-k);BI r=1;for(int i=1;i<=k;i++){r*=n-k+i;r/=i;}return r;}
static BI yb_perm_bi(int n,int k){BI r=1;for(int x=n-k+1;x<=n;x++)r*=x;return r;}
static std::vector<int> yb_unrank_names_idx(int n,int k,BI rank){rank-=1;std::vector<int>a(n),out;std::iota(a.begin(),a.end(),0);out.reserve(k);for(int pos=0;pos<k;pos++){BI block=yb_perm_bi((int)a.size()-1,k-pos-1);BI q=rank/block;rank%=block;int ix=q.convert_to<int>();out.push_back(a[ix]);a.erase(a.begin()+ix);}return out;}
static BI yb_comp_suffix(int rem,int parts,int mandatoryOffset){if(parts==0)return(rem==0&&(mandatoryOffset<0||mandatoryOffset==0))?BI(1):BI(0);if(rem<parts)return 0;if(mandatoryOffset<0||mandatoryOffset==0)return yb_binom_bi(rem-1,parts-1);if(mandatoryOffset<=0||mandatoryOffset>=rem||parts<2)return 0;return yb_binom_bi(rem-2,parts-2);}
static std::vector<int> yb_unrank_comp(int total,int parts,int mandatory,BI rank){int rem=total,cum=0;bool hit=mandatory<0;std::vector<int>out;out.reserve(parts);for(int pos=0;pos<parts;pos++){int left=parts-pos-1;bool sel=false;for(int val=1;val<=rem-left;val++){int after=rem-val,ncum=cum+val;bool nhit=hit||(mandatory>=0&&ncum==mandatory);int mo=-1;if(!nhit){if(mandatory<0||mandatory<ncum)continue;mo=mandatory-ncum;}BI block=yb_comp_suffix(after,left,nhit?-1:mo);if(rank>block){rank-=block;continue;}out.push_back(val);rem=after;cum=ncum;hit=nhit;sel=true;break;}if(!sel)throw std::runtime_error("composition rank exhausted");}return out;}

YBStructResult build_nonweave(int64_t calc,const FGates&G,const FY&y,const FSauce&so){
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
std::vector<BatchRecord> compute_segment(int64_t calc,int64_t first,int64_t last,const FGates&G,const FStones&S,const FY&y,const ExecutionParams& params){
    if(first<y.a+1||last>y.b||first>last)throw std::runtime_error("invalid year segment");
    FSauce structSauce=fast_sauce(calc,y.a+1,S);YBStructResult st=build_nonweave(calc,G,y,structSauce);
    const bool ybEdgeShortcutDisabled=[](){
        const char*v=std::getenv("SEER_DISABLE_EDGE_SHORTCUT");
        return v&&*v&&std::string(v)!="0";
    }();
    if(first==last&&!ybEdgeShortcutDisabled&&(first==y.a+1||first==y.b)){
        BatchRecord r;
        r.targetJdn=first;
        r.year=(long long)y.num;
        r.cutletCount=st.cutletCount;
        r.monthCount=st.monthCount;
        if(first==y.a+1){
            r.cutletIndex=st.cutName.front();
            r.dayInCutlet=1;
            r.monthIndex=st.monthName.front();
            r.dayInMonth=1;
        }else{
            const int ci=st.cutletCount-1,mi=st.monthCount-1;
            r.cutletIndex=st.cutName[ci];
            r.dayInCutlet=st.cutEnd[ci]-st.cutStart[ci]+1;
            r.monthIndex=st.monthName[mi];
            r.dayInMonth=st.monthLen[mi];
        }
        return std::vector<BatchRecord>{r};
    }
    if(const char*counter=std::getenv("SEER_TEST_WEAVE_COUNTER_FILE")){
        std::ofstream out(counter,std::ios::app);
        if(out)out<<"year_batch_weave\n";
    }
    int maxOffset=(int)(last-(y.a+1));
    auto weave=weave_month_prefix(
        st.monthLen,structSauce,maxOffset+1,
        params.threads,params.superblock,params.replayThreads);
    std::vector<int>seen(st.monthCount,0);std::vector<BatchRecord>out;out.reserve((size_t)(last-first+1));
    for(int offset=0;offset<=maxOffset;offset++){
        int mi=weave[offset];if(mi<0||mi>=st.monthCount)throw std::runtime_error("invalid month index from weave");int dim=++seen[mi];
        int64_t target=y.a+1+offset;if(target<first)continue;
        int ci=-1;for(int i=0;i<st.cutletCount;i++)if(offset>=st.cutStart[i]&&offset<=st.cutEnd[i]){ci=i;break;}if(ci<0)throw std::runtime_error("cutlet lost");
        BatchRecord r;r.targetJdn=target;r.year=(long long)y.num;r.cutletIndex=st.cutName[ci];r.dayInCutlet=offset-st.cutStart[ci]+1;r.monthIndex=st.monthName[mi];r.dayInMonth=dim;r.cutletCount=st.cutletCount;r.monthCount=st.monthCount;out.push_back(r);
    }
    return out;
}


std::vector<BatchRecord> compute_full_year_days(
    int64_t calc,const FGates& G,const FY& y,const FSauce& structSauce,
    const YBStructResult& st,const ExecutionParams& params){
    const int yearLen=(int)(y.b-y.a);
    if(const char*counter=std::getenv("SEER_TEST_WEAVE_COUNTER_FILE")){
        std::ofstream out(counter,std::ios::app);if(out)out<<"weave\n";
    }
    auto weave=weave_month_prefix(st.monthLen,structSauce,yearLen,
        params.threads,params.superblock,params.replayThreads);
    std::vector<int>seen(st.monthCount,0);
    std::vector<BatchRecord>out;out.reserve((size_t)yearLen);
    for(int offset=0;offset<yearLen;++offset){
        int mi=weave[offset];
        if(mi<0||mi>=st.monthCount)throw std::runtime_error("invalid month index from weave");
        int dim=++seen[mi],ci=-1;
        for(int k=0;k<st.cutletCount;k++)if(offset>=st.cutStart[k]&&offset<=st.cutEnd[k]){ci=k;break;}
        if(ci<0)throw std::runtime_error("cutlet lost");
        out.push_back({y.a+1+offset,(long long)y.num,st.cutName[ci],
            offset-st.cutStart[ci]+1,st.monthName[mi],dim,st.cutletCount,st.monthCount});
    }
    return out;
}

} // namespace seer_native::detail
