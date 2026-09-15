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
  return (Test-Path (Join-Path $Path 'query\index.mjs')) -and
         (Test-Path (Join-Path $Path 'api\openapi.yaml')) -and
         (Test-Path (Join-Path $Path 'precompute\cache-lookup.mjs')) -and
         (Test-Path (Join-Path $Path 'generated\index.json'))
}
function ResolveRepo([string]$Explicit) {
  if ($Explicit) {
    $p = (Resolve-Path $Explicit).Path
    if (-not (IsRepo $p)) { throw "RepoRoot does not look like Stage-3 Pastafarian-Calendar-Seer: $p" }
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
      if ((IsRepo $_.FullName) -and -not $candidates.Contains($_.FullName)) { $candidates.Add($_.FullName) }
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
  Log 'Stage 4 HTTP updater started.'
  $Repo = ResolveRepo $RepoRoot
  Log "Repository: $Repo"
  $node = Get-Command node -ErrorAction Stop
  Log ("Node: " + (& $node.Source --version))

  $manifest = Get-Content -Raw -LiteralPath (Join-Path $PackageRoot 'PAYLOAD_MANIFEST.json') | ConvertFrom-Json
  if ($manifest.stage -ne 4) { throw "Unexpected manifest stage: $($manifest.stage)" }

  foreach ($prop in $manifest.requiredBaseSha256.PSObject.Properties) {
    $dst = Join-Path $Repo ($prop.Name -replace '/', '\')
    if (-not (Test-Path $dst)) { throw "Required Stage 3 base file missing: $($prop.Name)" }
    $got = Sha256 $dst
    if ($got -ne [string]$prop.Value) { throw "Stage 3 base mismatch for $($prop.Name): $got" }
  }
  Log 'Stage 3 base fingerprints verified.'

  foreach ($item in $manifest.files) {
    $src = Join-Path (Join-Path $PackageRoot 'payload') ($item.path -replace '/', '\')
    if (-not (Test-Path $src)) { throw "Payload file missing: $($item.path)" }
    if ((Sha256 $src) -ne $item.sha256) { throw "Payload checksum mismatch: $($item.path)" }
    $dst = Join-Path $Repo ($item.path -replace '/', '\')
    if (Test-Path $dst) {
      $dstSha = Sha256 $dst
      if ($dstSha -ne $item.sha256) { throw "Existing Stage 4 target differs and will not be overwritten: $($item.path) SHA256=$dstSha" }
    }
  }
  Log "Payload checksums and target preconditions verified ($($manifest.files.Count) files)."

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  foreach ($item in $manifest.files) {
    $rel = $item.path -replace '/', '\'
    $src = Join-Path (Join-Path $PackageRoot 'payload') $rel
    $dst = Join-Path $Repo $rel
    if (Test-Path $dst) { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    $Created.Add($dst)
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  Log 'Stage 4 payload applied.'

  Push-Location $Repo
  try {
    foreach ($file in @('http\app.mjs','http\server.mjs')) {
      Log "Syntax check: $file"
      $rc = RunAndLog $node.Source @('--check', (Join-Path $Repo $file))
      if ($rc -ne 0) { throw "Node syntax check failed for $file with exit code $rc" }
    }

    $tests = @()
    $tests += Get-ChildItem -LiteralPath (Join-Path $Repo 'precompute\test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
    $tests += Get-ChildItem -LiteralPath (Join-Path $Repo 'query\test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
    $tests += Get-ChildItem -LiteralPath (Join-Path $Repo 'http\test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
    Log "Running Node tests ($($tests.Count) files)."
    $rc = RunAndLog $node.Source (@('--test') + $tests)
    if ($rc -ne 0) { throw "Node tests failed with exit code $rc" }

    Log 'Running generated-cache validator.'
    $rc = RunAndLog $node.Source @((Join-Path $Repo 'precompute\validate-generated.mjs'))
    if ($rc -ne 0) { throw "Generated-cache validation failed with exit code $rc" }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $python) {
      & $python.Source -c "import jsonschema, yaml" 2>$null
      if ($LASTEXITCODE -eq 0) {
        Log 'Running existing OpenAPI/JSON-Schema contract tests.'
        $rc = RunAndLog $python.Source @((Join-Path $Repo 'api\tests\test_contract.py'))
        if ($rc -ne 0) { throw "Contract tests failed with exit code $rc" }
      } else {
        Log 'Python found but jsonschema/PyYAML are unavailable; optional contract test skipped.'
      }
    } else {
      Log 'Python not found; optional contract test skipped.'
    }
  } finally {
    Pop-Location
  }

  $result = @(
    'STATUS=PASS',
    'STAGE=4',
    "REPOSITORY=$Repo",
    "LOG=$LogPath",
    "FILES=$($manifest.files.Count)",
    'START_COMMAND=node http/server.mjs'
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath $ResultPath -Value $result -Encoding UTF8
  Log 'PASS. Stage 4 HTTP v1 adapter installed and verified.'
  exit 0
} catch {
  $failure = $_.Exception.Message
  try {
    Log ("FAIL: " + $failure)
    foreach ($dst in $Created) { if (Test-Path $dst) { Remove-Item -LiteralPath $dst -Force } }
    foreach ($x in $Backed) { if (Test-Path $x.Backup) { Copy-Item -LiteralPath $x.Backup -Destination $x.Dst -Force } }
    Log 'Rollback attempted for files touched by this run.'
  } catch { }
  $msg = @('STATUS=FAIL','STAGE=4',"ERROR=$failure","LOG=$LogPath") -join [Environment]::NewLine
  Set-Content -LiteralPath $ResultPath -Value $msg -Encoding UTF8
  exit 1
}
