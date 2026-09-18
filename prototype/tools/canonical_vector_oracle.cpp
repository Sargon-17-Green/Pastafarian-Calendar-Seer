#include "canonical_saved_sum_reference.hpp"
#include <boost/multiprecision/cpp_int.hpp>
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>
using BI=boost::multiprecision::cpp_int;

static BI choose_ref(const reference::Trace&so,int bowl,uint64_t seal,const BI&n,int*widthOut=nullptr){
    if(n<=0)throw std::runtime_error("Ways Count <= 0");
    auto d=reference::desc(so,bowl,seal);BI c=reference::rep(d.first),M=reference::M;
    auto step=[&](BI x)->BI{if(d.second)return x==M?BI(1):x+1;return x==1?M:x-1;};
    if(n<=M){BI lim=(M/n)*n;while(c>lim)c=step(c);if(widthOut)*widthOut=1;return (c-1)%n+1;}
    int width=1;BI space=M;while(space<n){space*=M;width++;}
    BI firstWide=1,weight=1,answer=c;for(int i=0;i<width;i++){firstWide+=(answer-1)*weight;weight*=M;answer=step(answer);}
    BI lim=(space/n)*n,accepted=firstWide;if(accepted>lim)accepted=d.second?BI(1):lim;
    if(widthOut)*widthOut=width;return (accepted-1)%n+1;
}

struct Gates{
    std::vector<uint16_t> positiveGap, negativeGap;
    std::vector<int64_t> pos;
    int minGate=0, maxGate=0, zeroSlot=0;

    static std::vector<uint16_t> readGaps(const std::string&fn){
        std::ifstream f(fn,std::ios::binary);if(!f)throw std::runtime_error("cannot open gates: "+fn);
        f.seekg(0,std::ios::end);size_t bytes=(size_t)f.tellg();f.seekg(0);
        if(bytes%2)throw std::runtime_error("odd gate file");
        std::vector<uint16_t> gap(bytes/2);
        for(size_t i=0;i<gap.size();i++){unsigned char b[2];f.read((char*)b,2);gap[i]=(uint16_t)b[0]|((uint16_t)b[1]<<8);}
        return gap;
    }
    explicit Gates(const std::string&positiveFn,const std::string&negativeFn=""){
        positiveGap=readGaps(positiveFn);
        if(!negativeFn.empty()) negativeGap=readGaps(negativeFn);
        minGate=-static_cast<int>(negativeGap.size());
        maxGate=static_cast<int>(positiveGap.size());
        zeroSlot=static_cast<int>(negativeGap.size());
        pos.resize(negativeGap.size()+positiveGap.size()+1);
        pos[(size_t)zeroSlot]=reference::FOUNDATION;
        for(size_t n=1;n<=negativeGap.size();++n)
            pos[(size_t)(zeroSlot-(int)n)]=pos[(size_t)(zeroSlot-(int)n+1)]-negativeGap[n-1];
        for(size_t n=1;n<=positiveGap.size();++n)
            pos[(size_t)(zeroSlot+(int)n)]=pos[(size_t)(zeroSlot+(int)n-1)]+positiveGap[n-1];
    }
    int min_index()const{return minGate;}
    int max_index()const{return maxGate;}
    int contain(int64_t d)const{
        if(d<=pos.front()||d>pos.back())throw std::runtime_error("day beyond gate corpus");
        auto it=std::lower_bound(pos.begin()+1,pos.end(),d);
        return minGate+int(it-pos.begin())-1;
    }
    int64_t at(int i)const{
        if(i<minGate||i>maxGate)throw std::out_of_range("gate index");
        return pos.at((size_t)(i-minGate));
    }
};
struct Year{long long num;int o,c;int64_t a,b;};
struct Candidate{int o,c;int64_t len;};
static bool in_legacy_calc_domain(int64_t calc,const Gates&G,int legacyRadius){
 if(legacyRadius<=0||legacyRadius>G.max_index()||-legacyRadius<G.min_index())return false;
 return calc>G.at(-legacyRadius)&&calc<=G.at(legacyRadius);
}
static Year anchor_year(int64_t calc,const Gates&G,bool saved,int legacyRadius){
 int k=G.contain(calc);bool legacy=in_legacy_calc_domain(calc,G,legacyRadius);
 int lo=legacy?-legacyRadius:G.min_index(),hi=legacy?legacyRadius:G.max_index();
 std::vector<Candidate>v;
 for(int o=k;o>=lo&&calc-G.at(o)<=5778;o--)for(int c=k+1;c<=hi&&G.at(c)-calc<=5778;c++){
   int64_t len=G.at(c)-G.at(o);if(c-o>=6&&len>=252&&len<=5778)v.push_back({o,c,len});
 }
 if(v.empty())throw std::runtime_error("no anchor candidates in corpus");
 std::sort(v.begin(),v.end(),[](auto&a,auto&b){return a.len!=b.len?a.len<b.len:a.o<b.o;});
 auto so=reference::sauce(calc,calc,saved);BI rank=choose_ref(so,1,10,BI(v.size()));
 auto q=v[(rank-1).convert_to<size_t>()];return{5000,q.o,q.c,G.at(q.o),G.at(q.c)};
}
static Year adjacent_year(int64_t calc,const Gates&G,const Year&y,bool next,bool saved,int legacyRadius){
 int fixed=next?y.c:y.o;bool legacy=in_legacy_calc_domain(calc,G,legacyRadius);
 if(next){
   int first=fixed+6;
   auto count=[&](int hi,int&last){last=first-1;for(int c=first;c<=hi;c++){if(G.at(c)-G.at(fixed)>5778)break;last=c;}return last-first+1;};
   int last=first-1,hi=(legacy&&fixed<legacyRadius)?legacyRadius:G.max_index();
   int n=first<=hi?count(hi,last):0;
   if(n<=0&&hi!=G.max_index()){hi=G.max_index();n=first<=hi?count(hi,last):0;}
   if(n<=0)throw std::runtime_error("no next year in corpus");
   auto so=reference::sauce(calc,G.at(fixed),saved);int rank=choose_ref(so,1,11,BI(n)).convert_to<int>();
   int c=first+rank-1;return{y.num+1,fixed,c,G.at(fixed),G.at(c)};
 }
 int first=fixed-6;
 auto count=[&](int lo,int&last){last=first+1;for(int o=first;o>=lo;o--){if(G.at(fixed)-G.at(o)>5778)break;last=o;}return first-last+1;};
 int last=first+1,lo=(legacy&&fixed>-legacyRadius)?-legacyRadius:G.min_index();
 int n=first>=lo?count(lo,last):0;
 if(n<=0&&lo!=G.min_index()){lo=G.min_index();n=first>=lo?count(lo,last):0;}
 if(n<=0)throw std::runtime_error("no previous year in corpus");
 auto so=reference::sauce(calc,G.at(fixed),saved);int rank=choose_ref(so,1,12,BI(n)).convert_to<int>();
 int o=first-rank+1;return{y.num-1,o,fixed,G.at(o),G.at(fixed)};
}
static Year find_year(int64_t calc,int64_t target,const Gates&G,bool saved,int legacyRadius,int&steps){
 Year y=anchor_year(calc,G,saved,legacyRadius);steps=0;
 while(target<y.a+1){y=adjacent_year(calc,G,y,false,saved,legacyRadius);steps++;}
 while(target>y.b){y=adjacent_year(calc,G,y,true,saved,legacyRadius);steps++;}
 return y;
}

static BI binom(int n,int k){if(n<0||k<0||k>n)return 0;k=std::min(k,n-k);BI r=1;for(int i=1;i<=k;i++){r*=n-k+i;r/=i;}return r;}
static BI perm_count(int n,int k){BI r=1;for(int x=n-k+1;x<=n;x++)r*=x;return r;}
static std::vector<int> unrank_names(int n,int k,BI rank){rank-=1;std::vector<int>a(n),out;std::iota(a.begin(),a.end(),0);for(int pos=0;pos<k;pos++){BI block=perm_count((int)a.size()-1,k-pos-1),q=rank/block;rank%=block;int ix=q.convert_to<int>();out.push_back(a[ix]);a.erase(a.begin()+ix);}return out;}
static BI comp_suffix(int rem,int parts,int mandatoryOffset){if(parts==0)return (rem==0&&(mandatoryOffset<0||mandatoryOffset==0))?BI(1):BI(0);if(rem<parts)return 0;if(mandatoryOffset<0||mandatoryOffset==0)return binom(rem-1,parts-1);if(mandatoryOffset<=0||mandatoryOffset>=rem||parts<2)return 0;return binom(rem-2,parts-2);}
static std::vector<int> unrank_comp(int total,int parts,int mandatory,BI rank){int rem=total,cum=0;bool hit=mandatory<0;std::vector<int>out;for(int pos=0;pos<parts;pos++){int left=parts-pos-1;bool selected=false;for(int val=1;val<=rem-left;val++){int after=rem-val,ncum=cum+val;bool nhit=hit||(mandatory>=0&&ncum==mandatory);int mo=-1;if(!nhit){if(mandatory<0||mandatory<ncum)continue;mo=mandatory-ncum;}BI block=comp_suffix(after,left,nhit?-1:mo);if(rank>block){rank-=block;continue;}out.push_back(val);rem=after;cum=ncum;hit=nhit;selected=true;break;}if(!selected)throw std::runtime_error("cutlet composition rank exhausted");}return out;}

struct MonthLengthDP{int total,parts;std::vector<std::vector<BI>>dp;MonthLengthDP(int T,int P):total(T),parts(P),dp(P+1,std::vector<BI>(T+1)){dp[0][0]=1;for(int p=1;p<=P;p++)for(int s=0;s<=T;s++){BI z=0;for(int v=4;v<=123&&v<=s;v++)z+=dp[p-1][s-v];dp[p][s]=z;}}BI count()const{return dp[parts][total];}std::vector<int>unrank(BI rank)const{int rem=total;std::vector<int>out;for(int pos=0;pos<parts;pos++){int left=parts-pos-1;bool selected=false;for(int v=4;v<=123;v++){int after=rem-v;if(after<0)break;BI block=dp[left][after];if(block==0)continue;if(rank>block){rank-=block;continue;}out.push_back(v);rem=after;selected=true;break;}if(!selected)throw std::runtime_error("month length rank exhausted");}return out;}};

struct WeaveTable{std::vector<int>len,pref;int m;std::vector<std::vector<BI>>f;BI N;explicit WeaveTable(const std::vector<int>&L):len(L),m((int)L.size()),f(m){pref.resize(m);int s=0;for(int i=0;i<m;i++){s+=len[i]-1;pref[i]=s;}f[m-1].assign(pref[m-1]+2,BI(1));for(int h=m-2;h>=0;--h){int qmax=pref[h]+1,n=len[h+1];f[h].assign(qmax+1,BI(0));BI cum=0,w=1;for(int q=1;q<=qmax;q++){int r=q-1;cum+=w*f[h+1][n+r];f[h][q]=cum;w*=n+r-1;w/=q;}}N=f[0][len[0]];}};
static std::vector<int> unrank_weave_prefix(const WeaveTable&T,BI rank,int need){int total=std::accumulate(T.len.begin(),T.len.end(),0);need=std::min(need,total);std::vector<int>w;w.reserve(need);w.push_back(0);std::vector<int>rem=T.len;rem[0]--;int pos=1,low=0,high=0,R=rem[0];BI A=1;while(pos<need){int span=high-low+1;std::vector<int>pre(span);int run=0;for(int i=low;i<=high;i++){run+=rem[i];pre[i-low]=run;}std::vector<BI>sp(span+1,BI(1)),sm(span+1,BI(1));for(int o=span-1;o>=0;o--){sp[o]=sp[o+1]*pre[o];sm[o]=sm[o+1]*(pre[o]-1);}BI futureSame=high<T.m-1?T.f[high][R]:BI(1);bool selected=false;for(int month=low;month<=high;month++){int rf=rem[month];if(rf==1&&month!=low)continue;int off=month-low;BI num,den;if(rf>1){num=BI(rf-1)*sp[off];den=BI(R)*sm[off];}else{num=sp[off+1];den=BI(R)*sm[off+1];}BI na=A*num/den,block=na*futureSame;if(rank>block){rank-=block;continue;}A=na;rem[month]--;R--;if(rem[month]==0)low++;w.push_back(month);pos++;selected=true;break;}if(selected)continue;int month=high+1;if(month>=T.m)throw std::runtime_error("weave open exhausted");int nr=T.len[month]-1;BI coeff=binom(R+nr-1,nr-1),na=A*coeff;int nR=R+nr;BI fut=month<T.m-1?T.f[month][nR+1]:BI(1),block=na*fut;if(rank>block)throw std::runtime_error("weave open rank exhausted");A=na;high=month;rem[month]--;R=nR;w.push_back(month);pos++;}return w;}

struct Result{Year y;int steps,offset,cutletIndex,dayCutlet,monthIndex,dayMonth,cutletCount,monthCount,weaveWidth;unsigned weaveBits;};
static Result calculate(int64_t calc,int64_t target,const Gates&G,bool saved,int legacyRadius){int steps=0;Year y=find_year(calc,target,G,saved,legacyRadius,steps);int yearLen=(int)(y.b-y.a),gapCount=y.c-y.o,offset=(int)(target-(y.a+1));auto so=reference::sauce(calc,y.a+1,saved);
 int cmax=std::min(17,gapCount),cutletCount=5+choose_ref(so,2,20,BI(cmax-5)).convert_to<int>();int mandatory=-1;if(calc>=y.a+1&&calc<=y.b){for(int gi=y.o+1;gi<y.c;gi++)if(G.at(gi)==calc){mandatory=gi-y.o;break;}}
 BI pc=mandatory<0?binom(gapCount-1,cutletCount-1):binom(gapCount-2,cutletCount-2);auto cutGaps=unrank_comp(gapCount,cutletCount,mandatory,choose_ref(so,2,21,pc));auto cutNames=unrank_names(17,cutletCount,choose_ref(so,5,22,perm_count(17,cutletCount)));
 int cut=-1,dayCut=0,gapOff=0,startOff=0;for(int i=0;i<cutletCount;i++){gapOff+=cutGaps[i];int endOff=(int)(G.at(y.o+gapOff)-(y.a+1));if(offset>=startOff&&offset<=endOff){cut=i;dayCut=offset-startOff+1;break;}startOff=endOff+1;}if(cut<0)throw std::runtime_error("cutlet lost");
 int minM=(yearLen+122)/123,maxM=std::min(47,yearLen/4);int monthCount=minM+choose_ref(so,3,30,BI(maxM-minM+1)).convert_to<int>()-1;MonthLengthDP ml(yearLen,monthCount);auto monthLen=ml.unrank(choose_ref(so,3,31,ml.count()));auto monthNames=unrank_names(47,monthCount,choose_ref(so,5,33,perm_count(47,monthCount)));
 WeaveTable wt(monthLen);int width=0;BI wrank=choose_ref(so,4,32,wt.N,&width);auto prefix=unrank_weave_prefix(wt,wrank,offset+1);int month=prefix[offset],dayMonth=0;for(int x:prefix)if(x==month)dayMonth++;unsigned bits=wt.N==0?0:boost::multiprecision::msb(wt.N)+1;
 return{y,steps,offset,cutNames[cut],dayCut,monthNames[month],dayMonth,cutletCount,monthCount,width,bits};}

int main(int argc,char**argv){
 if(argc<4){std::cerr<<"usage: canonical_vector_oracle POS_GATES calc target [--negative-gates=PATH] [--legacy-radius=N] [--raw-mutant]\n";return 2;}
 bool saved=true;std::string neg;int legacyRadius=0;
 for(int i=4;i<argc;i++){
   std::string a=argv[i];
   if(a=="--raw-mutant")saved=false;
   else if(a.rfind("--negative-gates=",0)==0)neg=a.substr(17);
   else if(a.rfind("--legacy-radius=",0)==0)legacyRadius=std::stoi(a.substr(16));
   else{std::cerr<<"unknown option: "<<a<<"\n";return 2;}
 }
 Gates G(argv[1],neg);
 int64_t calc=std::stoll(argv[2]),target=std::stoll(argv[3]);
 auto r=calculate(calc,target,G,saved,legacyRadius);
 std::cout<<"year="<<r.y.num<<" steps="<<r.steps<<" gates="<<r.y.o<<":"<<r.y.c
          <<" a="<<r.y.a<<" b="<<r.y.b<<" len="<<(r.y.b-r.y.a)
          <<" offset="<<r.offset<<" cutlet_idx="<<r.cutletIndex<<" day_cutlet="<<r.dayCutlet
          <<" month_idx="<<r.monthIndex<<" day_month="<<r.dayMonth<<" cutlets="<<r.cutletCount<<" months="<<r.monthCount
          <<" Nbits="<<r.weaveBits<<" width="<<r.weaveWidth<<"\n";
}
