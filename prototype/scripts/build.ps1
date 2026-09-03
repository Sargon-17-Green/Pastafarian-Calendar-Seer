$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Build = Join-Path $Root 'build'
New-Item -ItemType Directory -Force $Build | Out-Null
$Cxx = if ($env:CXX) { $env:CXX } else { 'g++' }
if (-not (Get-Command $Cxx -ErrorAction SilentlyContinue)) { throw "g++ not found. Use a GCC environment with GMP/GMPXX and Boost headers." }
& $Cxx -O2 -std=c++20 (Join-Path $Root 'tools/cpu_probe.cpp') -o (Join-Path $Build 'cpu_probe.exe')
if ($LASTEXITCODE -ne 0) { throw 'CPU probe build failed.' }
& (Join-Path $Build 'cpu_probe.exe')
if ($LASTEXITCODE -ne 0) { throw 'This prototype requires AVX-512F/DQ/BW/VL + AVX-512IFMA.' }
$Probe = Join-Path $Build 'deps_probe.cpp'
@'
#include <gmpxx.h>
#include <boost/multiprecision/cpp_int.hpp>
int main() { return 0; }
'@ | Set-Content -Encoding Ascii $Probe
& $Cxx -std=c++20 $Probe -lgmpxx -lgmp -o (Join-Path $Build 'deps_probe.exe')
if ($LASTEXITCODE -ne 0) { throw 'Missing GMP/GMPXX and/or Boost development headers for this g++ toolchain.' }
$Args = @('-O3','-DNDEBUG','-std=c++20','-fopenmp','-pthread','-mavx512f','-mavx512dq','-mavx512bw','-mavx512vl','-mavx512ifma','-mbmi2','-madx',('-I' + (Join-Path $Root 'src')),(Join-Path $Root 'src/pastafarian_cold_bench.cpp'),'-lgmpxx','-lgmp','-o',(Join-Path $Build 'pastafarian_cold_bench.exe'))
& $Cxx @Args
if ($LASTEXITCODE -ne 0) { throw 'Benchmark build failed.' }
Write-Host "Built: $(Join-Path $Build 'pastafarian_cold_bench.exe')"
