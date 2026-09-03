$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Build = Join-Path $Root 'build'
New-Item -ItemType Directory -Force $Build | Out-Null
$Cxx = if ($env:CXX) { $env:CXX } else { 'g++' }
if (-not (Get-Command $Cxx -ErrorAction SilentlyContinue)) { throw 'g++ not found.' }
$Probe = Join-Path $Build 'deps_probe_portable.cpp'
@'
#include <gmpxx.h>
#include <boost/multiprecision/cpp_int.hpp>
int main() { return 0; }
'@ | Set-Content -Encoding Ascii $Probe
& $Cxx -std=c++20 $Probe -lgmpxx -lgmp -o (Join-Path $Build 'deps_probe_portable.exe')
if ($LASTEXITCODE -ne 0) { throw 'Missing GMP/GMPXX and/or Boost development headers.' }
$Arch = if ($env:SEER_PORTABLE_CXXFLAGS) { $env:SEER_PORTABLE_CXXFLAGS -split '\s+' } else { @('-march=native') }
$Common = @('-O3','-DNDEBUG','-std=c++20','-fopenmp','-pthread') + $Arch + @('-I' + (Join-Path $Root 'src'))
& $Cxx @Common (Join-Path $Root 'src/pastafarian_cold_bench_portable.cpp') -lgmpxx -lgmp -o (Join-Path $Build 'pastafarian_cold_bench_portable.exe')
if ($LASTEXITCODE -ne 0) { throw 'Portable benchmark build failed.' }
& $Cxx @Common (Join-Path $Root 'src/rns_micro8_portable.cpp') -lgmpxx -lgmp -o (Join-Path $Build 'rns_micro8_portable_selftest.exe')
if ($LASTEXITCODE -ne 0) { throw 'Portable RNS self-test build failed.' }
Write-Host "Built portable backend in $Build"
