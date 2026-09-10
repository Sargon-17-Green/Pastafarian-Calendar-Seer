#pragma once
#include <boost/multiprecision/cpp_int.hpp>
#include <array>
#include <cstdint>
#include <utility>

namespace reference {
using boost::multiprecision::cpp_int;
const cpp_int M=(cpp_int(1)<<127)-1;
constexpr int64_t FOUNDATION=-13334246LL;
constexpr uint64_t BP[6]={17,19,23,29,31,37};
constexpr int PST[6]={0,1,2,3,4,0}, DST[3]={0,1,2}, DM[3]={3,5,7}, HGS[7]={0,1,2,3,4,0,1};
constexpr int VG[11][5]={{3,5,7,11,0},{5,7,11,13,1},{7,11,13,17,2},{11,13,17,19,3},{13,17,19,23,4},{17,19,23,29,0},{19,23,29,31,1},{23,29,31,37,2},{29,31,37,41,3},{31,37,41,43,4},{37,41,43,47,0}};
constexpr int HC[7][4]={{3,4,6,8},{5,7,10,12},{7,10,14,16},{9,13,18,20},{11,16,22,24},{13,19,26,28},{15,22,30,32}};
using Bowls=std::array<cpp_int,6>;
using Stones=std::array<std::array<cpp_int,5>,46>;
struct Trace{Bowls drop46{};std::array<Bowls,12> stirs{};std::array<int,6> last{};};
static cpp_int red(const cpp_int&x){cpp_int r=x%M;if(r<0)r+=M;return r;}
static cpp_int rep(const cpp_int&x){cpp_int r=red(x);return r==0?M:r;}
static uint64_t rank720(const cpp_int&x){cpp_int r=(rep(x)-1)%720;return r.convert_to<uint64_t>()+1;}
static std::array<int,6> perm720(uint64_t rank){uint64_t r=rank-1;const uint64_t fac[7]={1,1,2,6,24,120,720};int avail[6]={1,2,3,4,5,6},n=6;std::array<int,6> out{};for(int pos=0,rem=6;rem>=1;--rem,++pos){uint64_t block=fac[rem-1],q=r/block;r%=block;out[pos]=avail[q];for(int j=(int)q;j<n-1;j++)avail[j]=avail[j+1];--n;}return out;}
static cpp_int daynum(int64_t d){if(d==FOUNDATION)return 1;if(d>FOUNDATION)return cpp_int(2)*uint64_t(d-FOUNDATION)+1;return cpp_int(2)*uint64_t(FOUNDATION-d);}
static Stones stones(){Stones R{};R[0]={17,29,43,71,101};for(int i=1;i<46;i++){auto&o=R[i-1];cpp_int d=i+1;R[i][0]=red(o[0]*o[0]+3*o[1]+d);R[i][1]=red(o[1]*o[1]+5*o[2]+o[0]);R[i][2]=red(o[2]*o[2]+7*o[3]+o[1]);R[i][3]=red(o[3]*o[3]+11*o[4]+o[2]);R[i][4]=red(o[4]*o[4]+13*o[0]+o[3]);}return R;}
static Trace sauce(int64_t cj,int64_t tj,bool savedSum=true){static const Stones S=stones();Trace tr;cpp_int calc=daynum(cj),target=daynum(tj),dist=uint64_t(cj>=tj?cj-tj:tj-cj)+1,sum=red(calc+target),dir=tj<cj?1:(tj==cj?2:3);std::array<cpp_int,8>hb{};
 for(int h=1;h<=7;h++){auto&s=S[h-1];cpp_int v=red(calc+HC[h-1][0]*target+HC[h-1][1]*dist+HC[h-1][2]*sum+HC[h-1][3]*dir+s[0]+s[1]+s[2]+s[3]+s[4]);for(int g=1;g<=7;g++)v=red(v*v+3*v+s[HGS[g-1]]+g);hb[h]=v;}
 Bowls b{};for(int j=0;j<6;j++){cpp_int x=red(calc+(j+1)*target+dist+sum+dir+BP[j]*BP[j]);b[j]=red(x*x+(j+1));}std::array<cpp_int,47>seq{};auto seqv=[&](int i)->cpp_int{return i>=1?seq[i]:hb[1-i];};
 for(int drop=1;drop<=46;drop++){auto&s=S[drop-1];cpp_int p=seqv(drop-1),p3=seqv(drop-3),p7=seqv(drop-7),v=red(s[0]*calc+s[1]*target+s[2]*dist+s[3]*sum+s[4]*dir+p+3*p3+5*p7+drop);for(int g=0;g<11;g++){auto&q=VG[g];v=red(v*v+q[0]*v+q[1]*p+q[2]*p3+q[3]*p7+s[q[4]]);}seq[drop]=v;auto ord=perm720(rank720(v));tr.last=ord;Bowls old=b,direct{},next{};for(int pl=0;pl<3;pl++){int bi=ord[pl]-1;direct[bi]=red(v*v+s[DST[pl]]*old[bi]+DM[pl]*drop);}for(int pl=0;pl<6;pl++){int bi=ord[pl]-1,pi=ord[(pl+5)%6]-1,ni=ord[(pl+1)%6]-1;cpp_int u=red(old[bi]+2*old[pi]+3*old[ni]+direct[bi]+v+s[PST[pl]]);next[bi]=red(u*u+5*old[pi]*old[ni]+drop*(pl+1));}b=next;}
 tr.drop46=b;
 for(int round=1;round<=12;round++){Bowls old=b,next{};cpp_int raw=0;for(auto&x:old)raw=red(raw+x);cpp_int R=red(raw+149*round);auto ord=perm720(rank720(R));for(int pl=0;pl<6;pl++){int bi=ord[pl]-1,pi=ord[(pl+5)%6]-1,ni=ord[(pl+1)%6]-1;cpp_int u=red(old[bi]+3*old[pi]+5*old[ni]+(savedSum?R:raw)+round+(pl+1)*(pl+1));next[bi]=red(u*u+7*old[pi]*old[ni]);}b=next;tr.stirs[round-1]=b;}return tr;}
static std::pair<cpp_int,bool> desc(const Trace&tr,int bowl,uint64_t seal){int pl=0;while(tr.last[pl]!=bowl)pl++;int ni=tr.last[(pl+1)%6]-1;cpp_int first=red((tr.stirs[11][bowl-1]+seal+181)*(tr.stirs[11][bowl-1]+seal+181)+179*tr.stirs[11][ni]+seal);cpp_int dn=red((first+seal+194)*(first+seal+194)+193*first+197*tr.stirs[11][5]);return{first,(rep(dn)&1)!=0};}
}

