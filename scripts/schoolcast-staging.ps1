[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("AssertTarget", "Catalog", "Prepare", "Inspect", "FunctionalQa", "LoadQa", "SourceCatalog", "SourceQa", "ReadinessAudit", "StorageProbe", "ScannerRecoveryQa", "DevServer")]
  [string]$Command,
  [string]$EnvironmentFile = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local"),
  [ValidateRange(1024, 65535)]
  [int]$Port = 3100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$stagingRef = "clmbwnulotrviqvnwvvj"
$productionRef = "jcqpmdslmydxjsfdwenc"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Set-QueryParameter([string]$Value, [string]$Name, [string]$Setting) {
  $pattern = "(?<separator>[?&])" + [Regex]::Escape($Name) + "=[^&]*"
  if ([Regex]::IsMatch($Value, $pattern)) {
    return [Regex]::Replace($Value, $pattern, { param($match) $match.Groups["separator"].Value + $Name + "=" + $Setting }, 1)
  }
  $separator = if ($Value.Contains("?")) { "&" } else { "?" }
  return $Value + $separator + $Name + "=" + $Setting
}

function Import-ProtectedEnvironment([string]$Path) {
  $candidate = [IO.Path]::GetFullPath($Path)
  if (-not $candidate.StartsWith($secretsPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      -not $candidate.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase) -or
      -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Use the protected staging .local environment file."
  }
  foreach ($rawLine in [IO.File]::ReadAllLines($candidate)) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $pair = $line.Split("=", 2)
    if ($pair.Count -ne 2 -or $pair[0] -notmatch "^[A-Z_][A-Z0-9_]*$") {
      throw "Invalid protected staging environment entry."
    }
    $value = $pair[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($pair[0], $value, "Process")
  }
}

function Project-Ref([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Name is required." }
  try { $uri = [Uri]$Value } catch { throw "$Name is not a valid URL." }
  $hostName = $uri.DnsSafeHost.ToLowerInvariant()
  $userName = [Uri]::UnescapeDataString(($uri.UserInfo.Split(":", 2))[0]).ToLowerInvariant()
  if ($hostName -match "^db\.([a-z0-9]+)\.supabase\.co$") { return $Matches[1] }
  if ($hostName.EndsWith(".pooler.supabase.com") -and $userName -match "^postgres\.([a-z0-9]+)$") {
    return $Matches[1]
  }
  throw "$Name does not identify a Supabase project."
}

function Assert-Staging {
  if ($env:NODE_ENV -eq "production") { throw "SchoolCast staging tooling is disabled in production mode." }
  if ($env:SCHOOLCAST_STAGING_PROJECT_REF -ne $stagingRef) { throw "Unapproved SchoolCast staging project." }
  foreach ($name in @("DATABASE_URL", "DIRECT_URL")) {
    $ref = Project-Ref ([Environment]::GetEnvironmentVariable($name, "Process")) $name
    if ($ref -eq $productionRef) { throw "Production target detected. Operation refused." }
    if ($ref -ne $stagingRef) { throw "$name does not target approved staging." }
  }
  if ($env:SUPABASE_URL -ne "https://$stagingRef.supabase.co") {
    throw "Supabase storage does not target approved staging."
  }
  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) {
    throw "The protected staging service-role key is required."
  }
  if (-not [string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)) {
    throw "The staging service-role key must remain server-only."
  }
  Write-Host "Verified SchoolCast staging target ($stagingRef)."
}

function Invoke-Node([string]$Script, [string[]]$Arguments = @()) {
  Assert-Staging
  Push-Location $root
  try {
    & node --import tsx (Join-Path $PSScriptRoot $Script) @Arguments
    if ($LASTEXITCODE -ne 0) { throw "SchoolCast staging command failed with exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }
}

function Assert-Storage {
  if ($env:SCHOOLCAST_STORAGE_BUCKET -ne "schoolcast-private") {
    throw "SchoolCast staging bucket must be schoolcast-private."
  }
  if ($env:SCHOOLCAST_MALWARE_SCANNER_MODE -ne "CLAMAV") {
    throw "SchoolCast staging attachments require ClamAV."
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "schoolcast-staging-scanner.ps1") -Command Assert
  if ($LASTEXITCODE -ne 0) { throw "Staging ClamAV readiness failed." }
}

Import-ProtectedEnvironment $EnvironmentFile
Assert-Staging

switch ($Command) {
  "AssertTarget" { break }
  "Catalog" { Invoke-Node "audit-schoolcast-staging-catalog.ts" }
  "Prepare" { Invoke-Node "schoolcast-staging-qa.ts" @("prepare") }
  "Inspect" { Invoke-Node "schoolcast-staging-qa.ts" @("inspect") }
  "FunctionalQa" { Invoke-Node "schoolcast-staging-qa.ts" @("functional") }
  "LoadQa" {
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "connection_limit" "15"
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "pool_timeout" "60"
    Invoke-Node "schoolcast-staging-load-qa.ts"
  }
  "SourceCatalog" { Invoke-Node "audit-schoolcast-source-fixtures.ts" }
  "SourceQa" {
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "connection_limit" "15"
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "pool_timeout" "60"
    Invoke-Node "schoolcast-staging-source-qa.ts"
  }
  "ReadinessAudit" { Invoke-Node "audit-schoolcast-release-readiness.ts" }
  "StorageProbe" {
    Assert-Storage
    Invoke-Node "schoolcast-staging-storage-probe.ts"
  }
  "ScannerRecoveryQa" {
    Assert-Storage
    Invoke-Node "schoolcast-staging-scanner-recovery-qa.ts" @("prepare")
    try {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "schoolcast-staging-scanner.ps1") -Command Stop
      if ($LASTEXITCODE -ne 0) { throw "Unable to stop staging ClamAV for recovery QA." }
      Invoke-Node "schoolcast-staging-scanner-recovery-qa.ts" @("unavailable")
    }
    finally {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "schoolcast-staging-scanner.ps1") -Command Start
      if ($LASTEXITCODE -ne 0) { throw "Unable to restore staging ClamAV after recovery QA." }
    }
    Invoke-Node "schoolcast-staging-scanner-recovery-qa.ts" @("recover")
  }
  "DevServer" {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { throw "Local port $Port is already in use." }
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "connection_limit" "5"
    $env:DATABASE_URL = Set-QueryParameter $env:DATABASE_URL "pool_timeout" "30"
    $env:APP_URL = "http://localhost:$Port"
    $env:WEBAUTHN_ORIGIN = $env:APP_URL
    $env:WEBAUTHN_RP_ID = "localhost"
    Push-Location $root
    try {
      & npm.cmd run dev:raw -- --hostname 127.0.0.1 --port $Port
      if ($LASTEXITCODE -ne 0) { throw "SchoolCast staging dev server stopped with exit code $LASTEXITCODE." }
    }
    finally {
      Pop-Location
    }
  }
}
