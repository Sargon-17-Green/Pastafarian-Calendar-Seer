param([int]$Repetitions = 3, [int]$Threads = 5, [int]$Superblock = 512)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Exe = Join-Path $Root 'build/pastafarian_cold_bench.exe'
if (-not (Test-Path $Exe)) { & (Join-Path $Root 'scripts/build.ps1') }
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
$Csv = Join-Path $Root "results/benchmark-$Stamp.csv"
$Log = Join-Path $Root "results/benchmark-$Stamp.log"
New-Item -ItemType Directory -Force (Join-Path $Root 'results') | Out-Null
$Rows = @()
Push-Location (Join-Path $Root 'data')
try {
  for ($rep=1; $rep -le $Repetitions; $rep++) {
    foreach ($case in ($Cases | Sort-Object {Get-Random})) {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $out = & $Exe $case.Calc $case.Target $Threads $Superblock 2>&1 | Out-String
      $sw.Stop()
      "=== rep=$rep case=$($case.Name) calc=$($case.Calc) target=$($case.Target) external_wall_ms=$([math]::Round($sw.Elapsed.TotalMilliseconds,3)) ===`n$out" | Tee-Object -FilePath $Log -Append | Write-Host
      $msLine = ($out -split "`r?`n" | Where-Object { $_ -like 'ms *' } | Select-Object -First 1)
      $vals = @{}
      foreach ($m in [regex]::Matches($msLine, '([A-Za-z_]+)=([0-9.]+)')) { $vals[$m.Groups[1].Value] = [double]$m.Groups[2].Value }
      $Rows += [pscustomobject]@{rep=$rep; case=$case.Name; calc=$case.Calc; target=$case.Target; threads=$Threads; sb=$Superblock; external_wall_ms=[math]::Round($sw.Elapsed.TotalMilliseconds,3); engine_all_ms=$vals['all']; walk_ms=$vals['walk']; rns_count_ms=$vals['rns_count']; prefix_total_ms=$vals['prefix_total']; replay_ms=$vals['replay']; reset_ms=$vals['reset']; cert=$vals['cert']; splits=$vals['splits']}
    }
  }
} finally { Pop-Location }
$Rows | Export-Csv -NoTypeInformation -Encoding UTF8 $Csv
Write-Host "CSV: $Csv"
Write-Host "Log: $Log"
