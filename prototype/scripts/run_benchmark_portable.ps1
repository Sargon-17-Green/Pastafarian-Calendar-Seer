param([int]$Repetitions = 3, [int]$Threads = 4, [int]$Superblock = 512)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Exe = Join-Path $Root 'build/pastafarian_cold_bench_portable.exe'
if (-not (Test-Path $Exe)) { & (Join-Path $Root 'scripts/build_portable.ps1') }
$env:OMP_NUM_THREADS = "$Threads"
$env:OMP_PROC_BIND = 'close'
$env:OMP_PLACES = 'cores'
$Cases = @(
  @{Name='same-start'; Calc='2461290'; Target='2461247'},
  @{Name='same-query'; Calc='2461290'; Target='2461290'},
  @{Name='same-mid'; Calc='2461290'; Target='2462913'},
  @{Name='same-end'; Calc='2461290'; Target='2464579'},
  @{Name='far-past-3576y'; Calc='2461290'; Target='-12829630'}
)
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Results = Join-Path $Root 'results'
New-Item -ItemType Directory -Force $Results | Out-Null
$Log = Join-Path $Results "portable-benchmark-$Stamp.log"
Push-Location (Join-Path $Root 'data')
try {
  for ($rep=1; $rep -le $Repetitions; $rep++) {
    foreach ($case in $Cases) {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $out = & $Exe $case.Calc $case.Target $Threads $Superblock 2>&1 | Out-String
      $sw.Stop()
      "=== backend=portable rep=$rep case=$($case.Name) calc=$($case.Calc) target=$($case.Target) external_wall_ms=$([math]::Round($sw.Elapsed.TotalMilliseconds,3)) ===`n$out" | Tee-Object -FilePath $Log -Append | Write-Host
    }
  }
} finally { Pop-Location }
Write-Host "Log: $Log"
