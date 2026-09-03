# Windows build note

The source needs a single GCC environment in which `g++`, `gmpxx.h`, `libgmpxx`, `libgmp`, and Boost headers belong to the same toolchain.

If your current standalone MinGW reports `fatal error: gmp.h: No such file or directory`, that toolchain is not sufficient yet. Use a MinGW/MSYS2 environment with GMP/GMPXX and Boost development packages installed, then run `scripts/build.ps1` from that environment (or from PowerShell with that `g++` first on PATH).

Do not substitute a non-AVX-512 build flag set and compare its timing to this baseline; that would be a different backend.
