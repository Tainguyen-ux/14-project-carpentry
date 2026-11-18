param(
  [string]$DeploymentId = "",
  [string]$Description = "Deploy Project Web App"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$ClaspFile = Join-Path $PSScriptRoot ".clasp.json"
if (-not (Test-Path $ClaspFile)) {
  throw "Khong tim thay file .clasp.json tai: $ClaspFile"
}

$ClaspConfig = Get-Content -Path $ClaspFile -Raw -Encoding UTF8 | ConvertFrom-Json
$ScriptId = [string]$ClaspConfig.scriptId
if ([string]::IsNullOrWhiteSpace($ScriptId) -or $ScriptId -eq "YOUR_PROJECT_SCRIPT_ID_HERE") {
  throw "Chua cau hinh Apps Script ID (scriptId) trong .clasp.json! Vui long dien scriptId cua du an truoc khi chay npm run deploy."
}

$SavedDeploymentId = ""
if ($ClaspConfig.PSObject.Properties.Name -contains "deploymentId") {
  $SavedDeploymentId = [string]$ClaspConfig.deploymentId
}
if ($SavedDeploymentId -eq "YOUR_DEPLOYMENT_ID_HERE") {
  $SavedDeploymentId = ""
}

$ResolvedDeploymentId = $DeploymentId.Trim()
if ([string]::IsNullOrWhiteSpace($ResolvedDeploymentId)) {
  $ResolvedDeploymentId = $SavedDeploymentId.Trim()
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   TRIEN KHAI DU AN WEB APP (GIU LINK CO DINH)" -ForegroundColor Cyan
Write-Host "   Apps Script ID : $ScriptId" -ForegroundColor Gray
Write-Host "=======================================================" -ForegroundColor Cyan

$SrcDir = Join-Path $PSScriptRoot "src"
$ManifestPath = Join-Path $SrcDir "appsscript.json"
$OriginalManifestRaw = ""
$TempCoreDir = Join-Path $SrcDir "_core_runtime"
$UsedEmbeddedCore = $false

if (Test-Path $ManifestPath) {
  $OriginalManifestRaw = [System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8)
  if ($OriginalManifestRaw -match "YOUR_CORE_LIBRARY_SCRIPT_ID_HERE") {
    # Tim thu muc app-core/src de dong bo tu dong khi chua khai bao Library ID rieng
    $CoreCandidates = @(
      (Join-Path $PSScriptRoot "..\app-core\src"),
      (Join-Path $PSScriptRoot "..\BaseAppScript\app-core\src")
    )
    $ResolvedCoreSrc = $null
    foreach ($Cand in $CoreCandidates) {
      if (Test-Path $Cand) {
        $ResolvedCoreSrc = (Resolve-Path $Cand).Path
        break
      }
    }

    if ($ResolvedCoreSrc) {
      Write-Host "`n[0/3] Dong bo tu dong Core Framework tu '$ResolvedCoreSrc' (Single-ScriptId Mode)..." -ForegroundColor Yellow
      if (Test-Path $TempCoreDir) {
        Remove-Item -Path $TempCoreDir -Recurse -Force
      }
      New-Item -ItemType Directory -Path $TempCoreDir -Force | Out-Null

      $CoreGsFiles = Get-ChildItem -Path $ResolvedCoreSrc -Recurse -Filter "*.gs"
      foreach ($File in $CoreGsFiles) {
        $DestName = if ($File.Name -eq "CoreDefaults_.gs") { "00_CoreDefaults_.gs" } elseif ($File.Name -eq "PublicApi.gs") { "99_PublicApi.gs" } else { "10_" + $File.Name }
        Copy-Item -Path $File.FullName -Destination (Join-Path $TempCoreDir $DestName) -Force
      }

      $StandaloneManifest = [ordered]@{
        timeZone         = "Asia/Ho_Chi_Minh"
        webapp           = [ordered]@{
          executeAs = "USER_DEPLOYING"
          access    = "ANYONE_ANONYMOUS"
        }
        exceptionLogging = "STACKDRIVER"
        runtimeVersion   = "V8"
      }
      $StandaloneManifestJson = $StandaloneManifest | ConvertTo-Json -Depth 5
      [System.IO.File]::WriteAllText($ManifestPath, $StandaloneManifestJson + "`n", (New-Object System.Text.UTF8Encoding($false)))
      $UsedEmbeddedCore = $true
    }
  }
}

try {
  Write-Host "`n[1/3] Day ma nguon (src/) len Google Apps Script (clasp push)..." -ForegroundColor White
  npx @google/clasp push -f
  if ($LASTEXITCODE -ne 0) {
    throw "clasp push that bai! Vui long kiem tra quyen truy cap scriptId: $ScriptId"
  }
} finally {
  if ($UsedEmbeddedCore) {
    if (Test-Path $TempCoreDir) {
      Remove-Item -Path $TempCoreDir -Recurse -Force
    }
    if (-not [string]::IsNullOrEmpty($OriginalManifestRaw)) {
      [System.IO.File]::WriteAllText($ManifestPath, $OriginalManifestRaw, (New-Object System.Text.UTF8Encoding($false)))
    }
  }
}

# Neu trong .clasp.json chua luu deploymentId, tu dong tra cuu deployment hien co tren Google Apps Script
if ([string]::IsNullOrWhiteSpace($ResolvedDeploymentId)) {
  Write-Host "`n[2/3] Dang kiem tra danh sach Deployment hien co tren Google Apps Script..." -ForegroundColor White
  $DeployListOutput = npx @google/clasp deployments 2>&1 | Out-String
  # Tim cac deployment co version (@1, @2...), bo qua @HEAD
  $VersionedMatches = [regex]::Matches($DeployListOutput, '-\s+(AKfyc[a-zA-Z0-9_-]+)\s+@(\d+)')
  if ($VersionedMatches.Count -gt 0) {
    $LastMatch = $VersionedMatches[$VersionedMatches.Count - 1]
    $ResolvedDeploymentId = $LastMatch.Groups[1].Value
    Write-Host "  -> Phat hien Deployment co san: $ResolvedDeploymentId" -ForegroundColor Yellow
  }
}

if (-not [string]::IsNullOrWhiteSpace($ResolvedDeploymentId)) {
  Write-Host "`n[2/3] Cap nhat code vao Deployment co dinh: $ResolvedDeploymentId ..." -ForegroundColor White
  $DeployOutput = npx @google/clasp deploy -i $ResolvedDeploymentId -d "$Description" 2>&1 | Out-String
  Write-Host $DeployOutput
  if ($LASTEXITCODE -ne 0) {
    throw "Cap nhat Deployment $ResolvedDeploymentId that bai!"
  }
} else {
  Write-Host "`n[2/3] Khoi tao Web App Deployment lan dau tien..." -ForegroundColor White
  $DeployOutput = npx @google/clasp deploy -d "$Description" 2>&1 | Out-String
  Write-Host $DeployOutput
  if ($LASTEXITCODE -ne 0) {
    throw "Khoi tao Deployment lan dau that bai!"
  }
  $NewMatch = [regex]::Match($DeployOutput, '(AKfyc[a-zA-Z0-9_-]+)')
  if ($NewMatch.Success) {
    $ResolvedDeploymentId = $NewMatch.Groups[1].Value
  }
}

# Luu khoa deploymentId co dinh vao .clasp.json cho moi lan npm run deploy sau nay
if (-not [string]::IsNullOrWhiteSpace($ResolvedDeploymentId) -and $SavedDeploymentId -ne $ResolvedDeploymentId) {
  Write-Host "`n[3/3] Luu khoa deploymentId co dinh vao .clasp.json..." -ForegroundColor White
  $UpdatedClasp = [ordered]@{
    scriptId     = $ScriptId
    rootDir      = if ($ClaspConfig.rootDir) { [string]$ClaspConfig.rootDir } else { "src" }
    deploymentId = $ResolvedDeploymentId
  }
  $JsonContent = $UpdatedClasp | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($ClaspFile, $JsonContent + "`n", (New-Object System.Text.UTF8Encoding($false)))
} else {
  Write-Host "`n[3/3] Kiem tra cau hinh .clasp.json: deploymentId da duoc khoa co dinh." -ForegroundColor White
}

$WebAppUrl = "https://script.google.com/macros/s/$ResolvedDeploymentId/exec"
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " [HOAN TAT] Trien khai thanh cong (Link khong doi)!" -ForegroundColor Green
Write-Host " - Apps Script ID : $ScriptId" -ForegroundColor Yellow
Write-Host " - Deployment ID  : $ResolvedDeploymentId" -ForegroundColor Yellow
Write-Host " - Fixed Web App  : $WebAppUrl" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
