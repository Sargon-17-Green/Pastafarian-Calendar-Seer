#define SEER_YEAR_BATCH_NO_MAIN
#include "pastafarian_year_batch.cpp"
#undef SEER_YEAR_BATCH_NO_MAIN
#include <boost/multiprecision/cpp_int.hpp>
#include <iostream>
#include <set>
using boost::multiprecision::cpp_int;

static cpp_int vc(int n,int k){
    if(n<0||k<0||k>n)return 0;k=std::min(k,n-k);cpp_int r=1;
    for(int i=1;i<=k;i++){r*=n-k+i;r/=i;}return r;
}
static cpp_int oracle_count(int p,int s){
    if(p==0)return s==0?cpp_int(1):cpp_int(0);
    if(s<4*p||s>123*p)return 0;
    int q=s-4*p;cpp_int r=0;
    for(int j=0;j<=q/120;j++){
        cpp_int term=vc(p,j)*vc(q-120*j+p-1,p-1);
        if(j&1)r-=term;else r+=term;
    }
    return r;
}
static std::vector<int> oracle_unrank(int total,int parts,cpp_int rank){
    int rem=total;std::vector<int>out;out.reserve(parts);
    for(int pos=0;pos<parts;pos++){
        int left=parts-pos-1,maxv=std::min(123,rem-4*left);bool selected=false;
        for(int v=4;v<=maxv;v++){
            cpp_int block=oracle_count(left,rem-v);
            if(rank>block){rank-=block;continue;}
            out.push_back(v);rem-=v;selected=true;break;
        }
        if(!selected)throw std::runtime_error("oracle rank exhausted");
    }
    if(rem!=0)throw std::runtime_error("oracle remainder");
    return out;
}
static unsigned bits(const cpp_int&x){return x==0?0:boost::multiprecision::msb(x)+1;}
int main(){
    try{
        const auto&t=yb_month_count_table();
        size_t cells=0,bad=0;unsigned maxBits=0;int maxP=-1,maxS=-1;
        for(int p=0;p<=47;p++){
            cells+=t.f[p].size();
            if(p==0){
                if(yb_u320_to_bi(t.at(0,0))!=1)throw std::runtime_error("D(0,0)");
                if(yb_u320_to_bi(t.at(0,1))!=0)throw std::runtime_error("D(0,1)");
                continue;
            }
            for(int s=0;s<=127*p;s++){
                cpp_int want=oracle_count(p,s),got=yb_u320_to_bi(t.at(p,s));
                if(got!=want){if(bad<8)std::cerr<<"mismatch p="<<p<<" s="<<s<<"\n";bad++;}
                if(s>=4*p&&s<=123*p){
                    if(got!=yb_u320_to_bi(t.at(p,127*p-s)))throw std::runtime_error("symmetry mismatch");
                    unsigned b=bits(want);if(b>maxBits){maxBits=b;maxP=p;maxS=s;}
                }
            }
        }
        size_t derivedCells=1;for(int p=1;p<=47;p++)derivedCells+=(119*p)/2+1;
        if(cells!=derivedCells)throw std::runtime_error("stored cell count formula mismatch");
        if(bad)throw std::runtime_error("oracle mismatches");
        for(int p=1;p<=47;p++){
            std::set<int> totals{4*p,123*p,(4*p+123*p)/2};
            for(int total:totals){
                YBMonthDP dp(total,p);cpp_int n=dp.count();
                if(n<=0)throw std::runtime_error("positive count expected");
                std::vector<cpp_int> ranks{cpp_int(1),n,(n+1)/2};
                if(p>1){
                    cpp_int firstBlock=oracle_count(p-1,total-4);
                    if(firstBlock>0&&firstBlock<n){ranks.push_back(firstBlock);ranks.push_back(firstBlock+1);}
                }
                for(const auto&r:ranks)if(dp.unrank(r)!=oracle_unrank(total,p,r))throw std::runtime_error("unranking mismatch");
            }
        }
        std::cout<<"cells="<<cells<<" max_bits="<<maxBits<<" max_at_p="<<maxP<<" max_at_s="<<maxS
                 <<" oracle=PASS unrank=PASS\n";return 0;
    }catch(const std::exception&e){std::cerr<<"month_count_table_verify: "<<e.what()<<"\n";return 1;}
}
