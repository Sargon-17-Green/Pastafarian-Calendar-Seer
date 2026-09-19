param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir,
    [string]$GmpSourceArchive = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Build = Join-Path $Root 'prototype\build'
$ToolchainBin = if ($env:SEER_TOOLCHAIN_BIN) { $env:SEER_TOOLCHAIN_BIN } else { 'C:\msys64\ucrt64\bin' }
$Cxx = if ($env:CXX) { $env:CXX } else { Join-Path $ToolchainBin 'g++.exe' }
$Objdump = Join-Path $ToolchainBin 'objdump.exe'
$MsysRoot = Split-Path -Parent (Split-Path -Parent $ToolchainBin)
$Bash = Join-Path $MsysRoot 'usr\bin\bash.exe'
$Cygpath = Join-Path $MsysRoot 'usr\bin\cygpath.exe'
if (-not (Test-Path $Cxx)) { throw "C++ compiler not found: $Cxx" }
if (-not (Test-Path $Objdump)) { throw "objdump not found: $Objdump" }
if (-not (Test-Path $Bash)) { throw "MSYS2 bash not found: $Bash" }
if (-not (Test-Path $Cygpath)) { throw "MSYS2 cygpath not found: $Cygpath" }

$ExpectedGmpSha256 = 'a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898'
if (-not $GmpSourceArchive) {
    $GmpSourceArchive = Join-Path $env:TEMP 'gmp-6.3.0.tar.xz'
    if (-not (Test-Path $GmpSourceArchive)) {
        $Downloaded = $false
        foreach ($Url in @(
            'https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz',
            'https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz'
        )) {
            Remove-Item -Force $GmpSourceArchive -ErrorAction SilentlyContinue
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $GmpSourceArchive -TimeoutSec 180
                $CandidateSha256 = (Get-FileHash $GmpSourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($CandidateSha256 -eq $ExpectedGmpSha256) {
                    $Downloaded = $true
                    break
                }
            } catch {
                Write-Warning ('GMP download failed from {0}: {1}' -f $Url, $_.Exception.Message)
            }
        }
        if (-not $Downloaded) { throw 'Unable to download verified GMP 6.3.0 source archive' }
    }
}
$ActualGmpSha256 = (Get-FileHash $GmpSourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualGmpSha256 -ne $ExpectedGmpSha256) { throw "GMP source SHA-256 mismatch: $ActualGmpSha256" }

$GmpPrefix = if ($env:SEER_GMP_PREFIX) { $env:SEER_GMP_PREFIX } else { Join-Path $env:TEMP 'seer-gmp-prefix-win32-x64' }
if (-not $env:SEER_GMP_PREFIX) {
    $GmpWork = Join-Path $env:TEMP 'seer-gmp-work-win32-x64'
    $ArchivePosix = (& $Cygpath -u $GmpSourceArchive).Trim()
    $WorkPosix = (& $Cygpath -u $GmpWork).Trim()
    $PrefixPosix = (& $Cygpath -u $GmpPrefix).Trim()
    & $Bash (Join-Path $PSScriptRoot 'build-gmp-from-source.sh') 'win32-x64' $ArchivePosix $WorkPosix $PrefixPosix
    if ($LASTEXITCODE -ne 0) { throw "source GMP build failed: $LASTEXITCODE" }
}
if (-not (Test-Path (Join-Path $GmpPrefix 'include\gmp.h'))) { throw "source GMP prefix is incomplete: $GmpPrefix" }

$env:CXX = $Cxx
$env:SEER_GMP_PREFIX = $GmpPrefix
$env:SEER_RNS_BACKEND = 'portable'
$env:SEER_MARCH = 'x86-64'
$env:SEER_GMP_CPU_BASELINE = 'x86_64-generic'
$env:SEER_STATIC_GNU_RUNTIME = '1'
$env:Path = $ToolchainBin + ';' + $env:Path
$env:SEER_NATIVE_TOOLCHAIN = (& $Cxx --version | Select-Object -First 1)
$Pacman = Join-Path $MsysRoot 'usr\bin\pacman.exe'
if (Test-Path $Pacman) {
    $env:SEER_NATIVE_RUNTIME_PACKAGES = ((& $Pacman -Q mingw-w64-ucrt-x86_64-gcc-libs make m4 diffutils 2>$null) -join '; ')
}
if ($env:SEER_SKIP_NATIVE_BUILD -ne '1') {
    node (Join-Path $PSScriptRoot 'build-runtime.mjs')
    if ($LASTEXITCODE -ne 0) { throw "exact runtime build failed: $LASTEXITCODE" }
}

if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
$BinDir = Join-Path $OutputDir 'bin'
$LicensesDir = Join-Path $OutputDir 'licenses'
$SourceDir = Join-Path $OutputDir 'third_party\source'
New-Item -ItemType Directory -Force $BinDir, $LicensesDir, $SourceDir | Out-Null
$Executables = @(
    'seer_year_batch.exe',
    'seer_year_locator.exe',
    'seer_year_structure.exe',
    'seer_engine_service.exe'
)
foreach ($Name in $Executables) {
    $Source = Join-Path $Build $Name
    if (-not (Test-Path $Source)) { throw "missing exact runtime binary: $Source" }
    Copy-Item $Source (Join-Path $BinDir $Name)
}

$RuntimeDlls = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$DependencyQueue = [System.Collections.Generic.Queue[string]]::new()
foreach ($Name in $Executables) {
    $DependencyQueue.Enqueue((Join-Path $BinDir $Name))
}
while ($DependencyQueue.Count -gt 0) {
    $Binary = $DependencyQueue.Dequeue()
    foreach ($Line in (& $Objdump -p $Binary)) {
        if ($Line -match '^\s*DLL Name:\s*(.+?)\s*$') {
            $Dll = $Matches[1]
            $GmpCandidate = Join-Path (Join-Path $GmpPrefix 'bin') $Dll
            $ToolchainCandidate = Join-Path $ToolchainBin $Dll
            $Candidate = if (Test-Path $GmpCandidate) { $GmpCandidate } else { $ToolchainCandidate }
            if ((Test-Path $Candidate) -and $RuntimeDlls.Add($Dll)) {
                $Destination = Join-Path $BinDir $Dll
                Copy-Item $Candidate $Destination
                $DependencyQueue.Enqueue($Destination)
            }
        }
    }
}
$UnexpectedRuntimeDlls = @($RuntimeDlls | Where-Object { $_ -notmatch '^libgmp-[0-9]+\.dll$' })
if ($UnexpectedRuntimeDlls.Count -gt 0) {
    throw ('Prebuilt Windows runtime must statically link GCC/OpenMP/winpthreads; unexpected DLLs: ' + (($UnexpectedRuntimeDlls | Sort-Object) -join ', '))
}
$LicenseSource = Join-Path $Root 'third_party\licenses'
foreach ($Name in @(
    'LGPL-3.0.txt',
    'GPL-3.0.txt',
    'GCC-RUNTIME-LIBRARY-EXCEPTION-3.1.txt',
    'LIBWINPTHREAD.txt'
)) {
    $Source = Join-Path $LicenseSource $Name
    if (-not (Test-Path $Source)) { throw "missing bundled license text: $Source" }
    Copy-Item $Source (Join-Path $LicensesDir $Name)
}

Copy-Item $GmpSourceArchive (Join-Path $SourceDir 'gmp-6.3.0.tar.xz')
node (Join-Path $PSScriptRoot 'write-native-package.mjs') 'win32-x64' $OutputDir
if ($LASTEXITCODE -ne 0) { throw "native package metadata generation failed: $LASTEXITCODE" }

$PackJson = npm pack $OutputDir --dry-run --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "npm pack validation failed: $LASTEXITCODE" }
if (-not $PackJson -or -not $PackJson[0].filename) { throw 'npm pack dry-run did not report a package filename' }

Write-Host "Windows x64 native package staged: $OutputDir"
Write-Host ('Bundled toolchain DLLs: ' + (($RuntimeDlls | Sort-Object) -join ', '))
