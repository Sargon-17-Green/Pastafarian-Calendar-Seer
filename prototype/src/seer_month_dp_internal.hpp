#pragma once
#include "seer_selection_core.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <stdexcept>
#include <vector>
namespace seer_native::detail {
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
                if(sh<0||sh>pm)return Z;
                int q=std::min(sh,pm-sh);return f[p-1][q];
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


} // namespace seer_native::detail
