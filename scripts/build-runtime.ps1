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

$GmpCompileFlags = @()
$GmpLinkFlags = @()
if ($env:SEER_GMP_PREFIX) {
    $GmpInclude = Join-Path $env:SEER_GMP_PREFIX 'include'
    $GmpLib = Join-Path $env:SEER_GMP_PREFIX 'lib'
    if (-not (Test-Path (Join-Path $GmpInclude 'gmp.h'))) { throw "SEER_GMP_PREFIX is missing include\gmp.h: $env:SEER_GMP_PREFIX" }
    $GmpCompileFlags += ('-I' + $GmpInclude)
    $GmpLinkFlags += ('-L' + $GmpLib)
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
$ProbeArgs = @('-std=c++20') + $GmpCompileFlags + @($ProbeSource) + $GmpLinkFlags + @('-lgmp', '-o', $ProbeExe)
Invoke-Cxx $ProbeArgs 'Dependency probe'
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
if ($Backend -eq 'portable') {
    $BackendFlags = @('-DSEER_USE_PORTABLE_RNS=1')
    $WeaveSource = Join-Path $Source 'seer_weave_portable.cpp'
} else {
    $BackendFlags = @('-mavx2')
    $WeaveSource = Join-Path $Source 'seer_weave_avx2.cpp'
}
$March = if ($env:SEER_MARCH) { $env:SEER_MARCH } else { 'native' }
$StaticGnuRuntime = ($env:SEER_STATIC_GNU_RUNTIME -eq '1')
$Common = @('-O3', '-DNDEBUG', '-std=c++20', '-fopenmp')
if (-not $StaticGnuRuntime) { $Common += '-pthread' }
if ($March -and $March -ne 'none') { $Common += ('-march=' + $March) }
$Common += ('-I' + $Source)
$Common += $GmpCompileFlags
$RuntimeLinkFlags = if ($StaticGnuRuntime) {
    @('-static-libgcc', '-static-libstdc++', '-Wl,--as-needed', '-Wl,-Bstatic', '-lgomp', '-Wl,--whole-archive', '-lwinpthread', '-Wl,--no-whole-archive', '-Wl,-Bdynamic')
} else {
    @()
}
$Libraries = $RuntimeLinkFlags + $GmpLinkFlags + @('-lgmp')
$YearCore = Join-Path $Source 'seer_year_core.cpp'
$CalendarCore = Join-Path $Source 'seer_calendar_core.cpp'
$Targets = @(
    @{ Output = 'seer_year_batch.exe'; Sources = @($YearCore, $CalendarCore, $WeaveSource, (Join-Path $Source 'pastafarian_year_batch.cpp')) },
    @{ Output = 'seer_year_locator.exe'; Sources = @($YearCore, (Join-Path $Source 'seer_year_locator.cpp')) },
    @{ Output = 'seer_year_structure.exe'; Sources = @($YearCore, $CalendarCore, $WeaveSource, (Join-Path $Source 'seer_year_structure.cpp')) },
    @{ Output = 'seer_engine_service.exe'; Sources = @($YearCore, $CalendarCore, $WeaveSource, (Join-Path $Source 'seer_engine_service.cpp')) }
)

foreach ($Target in $Targets) {
    $Output = Join-Path $Build $Target.Output
    $Args = $Common + $BackendFlags + $Target.Sources + $Libraries + @('-o', $Output)
    Invoke-Cxx $Args "Build $($Target.Output)"
    if (-not (Test-Path $Output)) { throw "Missing runtime binary after build: $Output" }
    Write-Host "Built $Output"
}

Write-Host "Pastafarian Calendar Seer exact Windows runtime built successfully (RNS backend: $Backend)."
