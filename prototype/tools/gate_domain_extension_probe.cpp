#define main gate_domain_bench_disabled_main
#include "../src/year_fast_bench_v12.cpp"
#undef main

#include <iostream>
#include <stdexcept>

static void require(bool ok, const char* what) {
    if (!ok) throw std::runtime_error(what);
}

int main() {
    FGates g("gates_100k_u16.bin", "gates_negative_100k_u16.bin");
    require(g.min_index() == -100000, "min index");
    require(g.max_index() == 100000, "max index");
    require(g.at(0) == -13334246LL, "Foundation JDN");
    require(g.at(40000) == 6732954LL, "gate +40000");
    require(g.at(40001) == 6733782LL, "gate +40001");
    require(g.at(-40000) == -33409717LL, "gate -40000");
    require(g.at(-40001) == -33410555LL, "gate -40001");
    require(g.at(100000) == 36828783LL, "gate +100000");
    require(g.at(-100000) == -63473948LL, "gate -100000");
    require(g.at(40001) - g.at(40000) == 828, "positive extension gap");
    require(g.at(-40000) - g.at(-40001) == 838, "negative extension gap");
    require(g.contain(g.at(40000)) == 39999, "contain +40000 boundary");
    require(g.contain(g.at(40000) + 1) == 40000, "contain first positive extension day");
    require(g.contain(g.at(40001)) == 40000, "contain +40001 boundary");
    require(g.contain(g.at(-40000)) == -40001, "contain -40000 boundary");
    require(g.contain(g.at(-40000) + 1) == -40000, "contain last legacy negative interval");
    require(g.contain(g.at(-40001) + 1) == -40001, "contain first negative extension interval");
    bool low = false, high = false;
    try { (void)g.contain(g.at(-100000)); } catch (const std::runtime_error&) { low = true; }
    try { (void)g.contain(g.at(100000) + 1); } catch (const std::runtime_error&) { high = true; }
    require(low && high, "finite outer boundary");
    std::cout << "Gate-domain at/contain probe: PASS\n";
    return 0;
}
