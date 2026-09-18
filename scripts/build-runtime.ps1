$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Prototype = Join-Path $Root 'prototype'
$Build = Join-Path $Prototype 'build'
$Source = Join-Path $Prototype 'src'
New-Item -ItemType Directory -Force $Build | Out-Null

$Cxx = if ($env:CXX) { $env:CXX } else { 'g++' }
if (-not (Get-Command $Cxx -ErrorAction SilentlyContinue)) {
    throw 'g++ was not found. Install an MSYS2/MinGW toolchain with GMP/GMPXX and Boost headers.'
}

function Invoke-Cxx {
    param([string[]]$Arguments, [string]$Label)
    & $Cxx @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

$ProbeSource = Join-Path $Build 'deps_probe_runtime.cpp'
@'
#include <gmpxx.h>
#include <boost/multiprecision/cpp_int.hpp>
int main() { return 0; }
'@ | Set-Content -Encoding Ascii $ProbeSource
$ProbeExe = Join-Path $Build 'deps_probe_runtime.exe'
Invoke-Cxx @('-std=c++20', $ProbeSource, '-lgmpxx', '-lgmp', '-o', $ProbeExe) 'Dependency probe'
$Backend = if ($env:SEER_RNS_BACKEND) { $env:SEER_RNS_BACKEND.ToLowerInvariant() } else { 'auto' }
if ($Backend -notin @('auto', 'avx2', 'portable')) {
    throw 'SEER_RNS_BACKEND must be auto, avx2, or portable.'
}

$HasAvx2 = $false
if ($Backend -ne 'portable') {
    $AvxSource = Join-Path $Build 'avx2_probe_runtime.cpp'
@'
int main() {
#if defined(__GNUC__) && (defined(__x86_64__) || defined(__i386__))
    __builtin_cpu_init();
    return __builtin_cpu_supports("avx2") ? 0 : 3;
#else
    return 3;
#endif
}
'@ | Set-Content -Encoding Ascii $AvxSource
    $AvxExe = Join-Path $Build 'avx2_probe_runtime.exe'
    Invoke-Cxx @('-O2', '-std=c++20', $AvxSource, '-o', $AvxExe) 'AVX2 probe build'
    & $AvxExe
    $HasAvx2 = ($LASTEXITCODE -eq 0)
}
if ($Backend -eq 'auto') { $Backend = if ($HasAvx2) { 'avx2' } else { 'portable' } }
if ($Backend -eq 'avx2' -and -not $HasAvx2) { throw 'AVX2 was requested but is unavailable.' }
$BackendFlags = if ($Backend -eq 'portable') { @('-DSEER_USE_PORTABLE_RNS=1') } else { @() }
$Common = @(
    '-O3', '-DNDEBUG', '-std=c++20', '-fopenmp', '-pthread', '-march=native',
    ('-I' + $Source)
)
$Libraries = @('-lgmpxx', '-lgmp')
$Targets = @(
    @('pastafarian_year_batch.cpp', 'seer_year_batch.exe'),
    @('seer_year_locator.cpp', 'seer_year_locator.exe'),
    @('seer_year_structure.cpp', 'seer_year_structure.exe'),
    @('seer_engine_service.cpp', 'seer_engine_service.exe')
)

foreach ($Target in $Targets) {
    $Input = Join-Path $Source $Target[0]
    $Output = Join-Path $Build $Target[1]
    $EmbeddedMainWarningFlags = if ($Target[0] -in @('pastafarian_year_batch.cpp', 'seer_year_structure.cpp', 'seer_engine_service.cpp')) { @('-Wno-return-type') } else { @() }
    $Args = $Common + $BackendFlags + $EmbeddedMainWarningFlags + @($Input) + $Libraries + @('-o', $Output)
    Invoke-Cxx $Args "Build $($Target[1])"
    if (-not (Test-Path $Output)) { throw "Missing runtime binary after build: $Output" }
    Write-Host "Built $Output"
}

Write-Host "Pastafarian Calendar Seer exact Windows runtime built successfully (RNS backend: $Backend)."
