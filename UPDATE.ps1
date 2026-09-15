param([string]$RepoRoot = "")
$ErrorActionPreference = 'Stop'
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $PackageRoot 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogPath = Join-Path $LogDir ("UPDATE_LOG({0}).txt" -f $Stamp)
$ResultPath = Join-Path $LogDir ("UPDATE_RESULT({0}).txt" -f $Stamp)

function Log([string]$Text) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Text
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  Write-Host $line
}
function Sha256([string]$Path) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }
function IsRepo([string]$Path) {
  return (Test-Path (Join-Path $Path 'precompute\cache-lookup.mjs')) -and
         (Test-Path (Join-Path $Path 'precompute\lib\cache-format.mjs')) -and
         (Test-Path (Join-Path $Path 'generated\index.json')) -and
         (Test-Path (Join-Path $Path 'README.md'))
}
function ResolveRepo([string]$Explicit) {
  if ($Explicit) {
    $p = (Resolve-Path $Explicit).Path
    if (-not (IsRepo $p)) { throw "RepoRoot does not look like Pastafarian-Calendar-Seer: $p" }
    return $p
  }
  if ($env:SEER_REPO_ROOT) {
    $p = (Resolve-Path $env:SEER_REPO_ROOT).Path
    if (IsRepo $p) { return $p }
  }
  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($p in @($PackageRoot, (Split-Path -Parent $PackageRoot), (Get-Location).Path)) {
    if ($p -and (IsRepo $p) -and -not $candidates.Contains($p)) { $candidates.Add($p) }
  }
  $parent = Split-Path -Parent $PackageRoot
  if (Test-Path $parent) {
    Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      if (IsRepo $_.FullName) { if (-not $candidates.Contains($_.FullName)) { $candidates.Add($_.FullName) } }
    }
  }
  if ($candidates.Count -ne 1) {
    throw "Could not identify exactly one Seer repository automatically. Pass -RepoRoot or set SEER_REPO_ROOT. Candidates=$($candidates.Count)"
  }
  return $candidates[0]
}
function RunAndLog([string]$Exe, [object[]]$Args) {
  & $Exe @Args 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $line
  }
  return $LASTEXITCODE
}

$Created = New-Object System.Collections.Generic.List[string]
$Backed = New-Object System.Collections.Generic.List[object]
$BackupDir = Join-Path $LogDir ("backup-{0}" -f $Stamp)

try {
  Set-Content -LiteralPath $LogPath -Value '' -Encoding UTF8
  Log 'Stage 3 cumulative updater started.'
  $Repo = ResolveRepo $RepoRoot
  Log "Repository: $Repo"

  $node = Get-Command node -ErrorAction Stop
  $nodeVersion = & $node.Source --version
  Log "Node: $nodeVersion"

  $manifest = Get-Content -Raw -LiteralPath (Join-Path $PackageRoot 'PAYLOAD_MANIFEST.json') | ConvertFrom-Json
  if ($manifest.stage -ne 3) { throw "Unexpected manifest stage: $($manifest.stage)" }
  foreach ($item in $manifest.files) {
    $src = Join-Path (Join-Path $PackageRoot 'payload') ($item.path -replace '/', '\')
    if (-not (Test-Path $src)) { throw "Payload file missing: $($item.path)" }
    if ((Sha256 $src) -ne $item.sha256) { throw "Payload checksum mismatch: $($item.path)" }
  }
  Log "Payload checksums verified ($($manifest.files.Count) files)."

  # Refuse to overwrite any state other than the current payload or a known prior/base hash.
  foreach ($item in $manifest.files) {
    $rel = $item.path -replace '/', '\'
    $dst = Join-Path $Repo $rel
    if (-not (Test-Path $dst)) { continue }
    $dstSha = Sha256 $dst
    if ($dstSha -eq $item.sha256) { continue }
    $allowed = @()
    if ($null -ne $item.allowedBaseSha256) { $allowed = @($item.allowedBaseSha256) }
    if ($allowed -notcontains $dstSha) {
      throw "Existing file differs from every known base and will not be overwritten: $($item.path) SHA256=$dstSha"
    }
  }
  Log 'Existing-file preconditions verified.'

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  foreach ($item in $manifest.files) {
    $rel = $item.path -replace '/', '\'
    $src = Join-Path (Join-Path $PackageRoot 'payload') $rel
    $dst = Join-Path $Repo $rel
    $dstDir = Split-Path -Parent $dst
    New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
    if (Test-Path $dst) {
      if ((Sha256 $dst) -eq $item.sha256) { continue }
      $backup = Join-Path $BackupDir $rel
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $dst -Destination $backup -Force
      $Backed.Add([pscustomobject]@{Dst=$dst;Backup=$backup})
    } else {
      $Created.Add($dst)
    }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  Log 'Cumulative payload applied.'

  Push-Location $Repo
  try {
    Log 'Checking query-layer syntax.'
    foreach ($file in @('query\index.mjs','query\cli.mjs','query\provider-precomputed.mjs','query\day-boundary.mjs')) {
      $rc = RunAndLog $node.Source @('--check', (Join-Path $Repo $file))
      if ($rc -ne 0) { throw "Node syntax check failed for $file with exit code $rc" }
    }

    $tests = @()
    $tests += Get-ChildItem -LiteralPath (Join-Path $Repo 'precompute\test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
    $tests += Get-ChildItem -LiteralPath (Join-Path $Repo 'query\test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
    Log "Running Node tests ($($tests.Count) files)."
    $rc = RunAndLog $node.Source (@('--test') + $tests)
    if ($rc -ne 0) { throw "Node tests failed with exit code $rc" }

    Log 'Running generated-cache validator.'
    $rc = RunAndLog $node.Source @((Join-Path $Repo 'precompute\validate-generated.mjs'))
    if ($rc -ne 0) { throw "Generated-cache validation failed with exit code $rc" }

    # CLI smoke test uses an explicit calculation day, so it does not depend on wall-clock cache horizon.
    $index = Get-Content -Raw -LiteralPath (Join-Path $Repo 'generated\index.json') | ConvertFrom-Json
    if ($index.caches.Count -lt 1) { throw 'generated/index.json has no cache descriptors for CLI smoke test' }
    $desc = $index.caches[0]
    $cache = Get-Content -Raw -LiteralPath (Join-Path $Repo ('generated\' + ($desc.path -replace '/', '\'))) | ConvertFrom-Json
    if ($cache.records.Count -lt 1) { throw 'selected generated cache has no records' }
    $firstTarget = $cache.records[0].targetJdn
    Log 'Running CLI date smoke test.'
    $rc = RunAndLog $node.Source @((Join-Path $Repo 'query\cli.mjs'), 'date', '--calculation-jdn', [string]$desc.calcJdn, '--target-jdn', [string]$firstTarget, '--canonical')
    if ($rc -ne 0) { throw "CLI smoke test failed with exit code $rc" }

    # Contract tests are useful but depend on optional Python packages. Run them when available.
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $python) {
      & $python.Source -c "import jsonschema, yaml" 2>$null
      if ($LASTEXITCODE -eq 0) {
        Log 'Running OpenAPI/JSON-Schema contract tests.'
        $rc = RunAndLog $python.Source @((Join-Path $Repo 'api\tests\test_contract.py'))
        if ($rc -ne 0) { throw "Contract tests failed with exit code $rc" }
      } else {
        Log 'Python found, but jsonschema/PyYAML are unavailable; optional contract test skipped.'
      }
    } else {
      Log 'Python not found; optional contract test skipped.'
    }
  } finally {
    Pop-Location
  }

  $result = @(
    'STATUS=PASS',
    'STAGE=3',
    "REPOSITORY=$Repo",
    "LOG=$LogPath",
    "FILES=$($manifest.files.Count)"
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath $ResultPath -Value $result -Encoding UTF8
  Log 'PASS. Stage 3 query-layer expansion installed and verified.'
  exit 0
} catch {
  $failure = $_.Exception.Message
  try {
    Log ("FAIL: " + $failure)
    foreach ($x in $Backed) {
      if (Test-Path $x.Backup) { Copy-Item -LiteralPath $x.Backup -Destination $x.Dst -Force }
    }
    foreach ($dst in $Created) {
      if (Test-Path $dst) { Remove-Item -LiteralPath $dst -Force }
    }
    Log 'Rollback attempted for files touched by this run.'
  } catch { }
  $msg = @('STATUS=FAIL','STAGE=3',"ERROR=$failure","LOG=$LogPath") -join [Environment]::NewLine
  Set-Content -LiteralPath $ResultPath -Value $msg -Encoding UTF8
  exit 1
}
