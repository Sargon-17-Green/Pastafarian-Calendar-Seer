#include <iostream>
#if defined(__GNUC__) || defined(__clang__)
int main() {
  __builtin_cpu_init();
  const bool f    = __builtin_cpu_supports("avx512f");
  const bool dq   = __builtin_cpu_supports("avx512dq");
  const bool bw   = __builtin_cpu_supports("avx512bw");
  const bool vl   = __builtin_cpu_supports("avx512vl");
  const bool ifma = __builtin_cpu_supports("avx512ifma");
  std::cout << "avx512f=" << f << " avx512dq=" << dq << " avx512bw=" << bw
            << " avx512vl=" << vl << " avx512ifma=" << ifma << "\n";
  return (f && dq && bw && vl && ifma) ? 0 : 3;
}
#else
int main() { std::cerr << "Unsupported compiler for CPU probe\n"; return 4; }
#endif
