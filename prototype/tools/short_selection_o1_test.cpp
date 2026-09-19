#include "../src/short_selection_o1.hpp"
#include <boost/multiprecision/cpp_int.hpp>
#include <gmpxx.h>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>

using BI = boost::multiprecision::cpp_int;

static uint64_t literal_accepted(
    uint64_t M, uint64_t N, uint64_t c, bool forward) {
    const uint64_t L = (M / N) * N;
    uint64_t x = c;
    while (x > L) {
        x = forward ? (x == M ? 1 : x + 1)
                    : (x == 1 ? M : x - 1);
    }
    return x;
}

static uint64_t mapped(uint64_t accepted, uint64_t N) {
    return 1 + ((accepted - 1) % N);
}

static void require(bool ok, const std::string& message) {
    if (!ok) throw std::runtime_error(message);
}
static void check_case(
    uint64_t M, uint64_t N, uint64_t c, bool forward) {
    const uint64_t literal = literal_accepted(M, N, c, forward);
    const uint64_t shortcut =
        seer_short_selection_accepted_o1(M, N, c, forward);
    require(literal == shortcut, "accepted-value mismatch");
    require(mapped(literal, N) == mapped(shortcut, N),
            "mapped-result mismatch");
}

static void exhaustive_small_domain() {
    for (uint64_t M = 1; M <= 96; ++M) {
        for (uint64_t N = 1; N <= M; ++N) {
            for (uint64_t c = 1; c <= M; ++c) {
                check_case(M, N, c, false);
                check_case(M, N, c, true);
            }
        }
    }
}

static void explicit_boundaries() {
    check_case(10, 3, 1, false);  // c = 1
    check_case(10, 3, 9, true);   // c = L
    check_case(10, 3, 10, false); // c = L+1 = M, tail size 1
    check_case(12, 3, 12, true);  // M mod N = 0
    check_case(12, 1, 12, false); // N = 1
    check_case(12, 12, 12, true); // N = M
}
static void big_integer_boundaries() {
    const BI biM = (BI(1) << 127) - 1;
    const BI biN = (BI(1) << 126) + 123;
    const BI biC = biM;
    const BI biL = (biM / biN) * biN;
    const BI biForward =
        seer_short_selection_accepted_o1(biM, biN, biC, true);
    const BI biBackward =
        seer_short_selection_accepted_o1(biM, biN, biC, false);
    require(biForward == 1, "BI forward huge-tail mismatch");
    require(biBackward == biL, "BI backward huge-tail mismatch");
    require(((biForward - 1) % biN) + 1 == 1,
            "BI forward mapped mismatch");
    require(((biBackward - 1) % biN) + 1 == biN,
            "BI backward mapped mismatch");

    const mpz_class mpM = (mpz_class(1) << 127) - 1;
    const mpz_class mpN = (mpz_class(1) << 126) + 123;
    const mpz_class mpC = mpM;
    const mpz_class mpL = (mpM / mpN) * mpN;
    const mpz_class mpForward =
        seer_short_selection_accepted_o1(mpM, mpN, mpC, true);
    const mpz_class mpBackward =
        seer_short_selection_accepted_o1(mpM, mpN, mpC, false);
    require(mpForward == 1, "mpz forward huge-tail mismatch");
    require(mpBackward == mpL, "mpz backward huge-tail mismatch");
    require(((mpForward - 1) % mpN) + 1 == 1,
            "mpz forward mapped mismatch");
    require(((mpBackward - 1) % mpN) + 1 == mpN,
            "mpz backward mapped mismatch");
    require(biForward.convert_to<std::string>() == mpForward.get_str(),
            "BI/mpz forward parity mismatch");
    require(biBackward.convert_to<std::string>() == mpBackward.get_str(),
            "BI/mpz backward parity mismatch");
}

int main() {
    try {
        exhaustive_small_domain();
        explicit_boundaries();
        big_integer_boundaries();
        std::cout << "short-selection O(1) lemma: PASS\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "short-selection O(1) lemma: FAIL: "
                  << e.what() << '\n';
        return 1;
    }
}
