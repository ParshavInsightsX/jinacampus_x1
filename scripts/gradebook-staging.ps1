[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("AssertTarget", "Connectivity", "ResetApplicationSchema", "Status", "ExpectedGradebookPending", "Deploy", "Generate", "Seed", "Drift", "Audit", "PilotPrepare", "PilotVerify", "PilotDisable", "PilotInspect", "PilotLocalReady", "StorageAssert", "StorageProbe", "RecoveryPrepare", "RecoveryInspect", "RecoveryExpireLatestPilot", "RecoveryExpireActiveSynthetic", "RecoveryVerify", "RecoveryRestoreSyntheticPasswords", "DevServer")]
  [string]$Command,

  [string]$EnvironmentFile = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local"),
  [string]$SchemaPath = "prisma/schema.prisma",
  [ValidateRange(1024, 65535)]
  [int]$Port = 3100,
  [switch]$UseWebpack
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedStagingRef = "clmbwnulotrviqvnwvvj"
$productionRef = "jcqpmdslmydxjsfdwenc"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$prisma = Join-Path $root "node_modules/.bin/prisma.cmd"
$resetSql = Join-Path $PSScriptRoot "sql/reset-gradebook-staging-application-schema.sql"
$connectivitySql = Join-Path $PSScriptRoot "sql/check-staging-connectivity.sql"
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsRootPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Import-ProtectedEnvironment([string]$Path) {
  $candidate = [IO.Path]::GetFullPath($Path)
  if (-not $candidate.StartsWith($secretsRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The staging environment file must stay inside the protected local JinaCampus secrets directory."
  }
  if (-not $candidate.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase)) {
    throw "The staging environment filename must end in .local."
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Missing protected staging environment file: $Path"
  }

  foreach ($rawLine in [IO.File]::ReadAllLines($candidate)) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $pair = $line.Split("=", 2)
    if ($pair.Count -ne 2 -or $pair[0] -notmatch "^[A-Z_][A-Z0-9_]*$") {
      throw "Invalid staging environment entry."
    }
    $value = $pair[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($pair[0], $value, "Process")
  }
}

function Get-ProjectRefFromDatabaseUrl([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
  try {
    $uri = [Uri]$Value
  }
  catch {
    throw "$Name must be a valid PostgreSQL URL."
  }
  if ($uri.Scheme -notin @("postgresql", "postgres")) {
    throw "$Name must use PostgreSQL."
  }

  $hostName = $uri.DnsSafeHost.ToLowerInvariant()
  $userName = [Uri]::UnescapeDataString(($uri.UserInfo.Split(":", 2))[0]).ToLowerInvariant()

  if ($hostName -match "^db\.([a-z0-9]+)\.supabase\.co$") {
    return $Matches[1]
  }
  if ($hostName.EndsWith(".pooler.supabase.com") -and $userName -match "^postgres\.([a-z0-9]+)$") {
    return $Matches[1]
  }
  throw "$Name does not identify a Supabase project reference."
}

function Assert-StagingTarget {
  $configuredRef = [Environment]::GetEnvironmentVariable("GRADEBOOK_STAGING_PROJECT_REF", "Process")
  if ($configuredRef -ne $expectedStagingRef) {
    throw "GRADEBOOK_STAGING_PROJECT_REF does not match the approved staging project."
  }
  if ($expectedStagingRef -eq $productionRef) {
    throw "Staging and production project references must differ."
  }

  $databaseRef = Get-ProjectRefFromDatabaseUrl $env:DATABASE_URL "DATABASE_URL"
  $directRef = Get-ProjectRefFromDatabaseUrl $env:DIRECT_URL "DIRECT_URL"
  if ($databaseRef -eq $productionRef -or $directRef -eq $productionRef) {
    throw "Production database target detected. Operation refused."
  }
  if ($databaseRef -ne $expectedStagingRef -or $directRef -ne $expectedStagingRef) {
    throw "Both database URLs must target the approved GradeBook staging project."
  }

  Write-Host "Verified staging target: gradebook-mvp-staging ($expectedStagingRef)."
}

function Assert-StagingStorageEnvironment {
  foreach ($name in @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GRADEBOOK_STORAGE_BUCKET")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
      throw "$name is required for GradeBook staging storage QA."
    }
  }
  try {
    $storageUri = [Uri]$env:SUPABASE_URL
  }
  catch {
    throw "SUPABASE_URL must be a valid URL."
  }
  if ($storageUri.Scheme -ne "https" -or $storageUri.DnsSafeHost.ToLowerInvariant() -ne "$expectedStagingRef.supabase.co") {
    throw "SUPABASE_URL must target the approved GradeBook staging project over HTTPS."
  }
  if ($env:SUPABASE_URL -match $productionRef) {
    throw "Production Supabase storage target detected. Operation refused."
  }
  if ($env:GRADEBOOK_STORAGE_BUCKET -ne "gradebook-private") {
    throw "GRADEBOOK_STORAGE_BUCKET must be gradebook-private for controlled staging QA."
  }
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "Process"))) {
    throw "A service-role key must never use a NEXT_PUBLIC_ environment variable."
  }
  Write-Host "Verified private GradeBook staging storage configuration."
}

function Use-StagingDirectConnection {
  $source = [Uri]$env:DIRECT_URL
  $userInfo = $source.UserInfo.Split(":", 2)
  if ($userInfo.Count -ne 2 -or [string]::IsNullOrWhiteSpace($userInfo[1])) {
    throw "DIRECT_URL does not contain staging database credentials."
  }
  $directHost = "db.$expectedStagingRef.supabase.co"
  $directUrl = "postgresql://postgres:$($userInfo[1])@$directHost`:5432/postgres?connection_limit=1&sslmode=require"
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $directUrl, "Process")
  [Environment]::SetEnvironmentVariable("DIRECT_URL", $directUrl, "Process")
  Assert-StagingTarget
  Write-Host "Using the project-specific staging direct connection."
}

function Use-StagingQaRuntimeConnection {
  $runtimeUrl = $script:protectedStagingRuntimeUrl
  if ([string]::IsNullOrWhiteSpace($runtimeUrl)) {
    throw "The protected staging runtime URL is unavailable."
  }
  if ($runtimeUrl -match '([?&])connection_limit=[^&]*') {
    $runtimeUrl = [regex]::Replace($runtimeUrl, '([?&])connection_limit=[^&]*', '$1connection_limit=3')
  }
  else {
    $runtimeUrl += $(if ($runtimeUrl.Contains('?')) { '&' } else { '?' }) + 'connection_limit=3'
  }
  if ($runtimeUrl -match '([?&])pool_timeout=[^&]*') {
    $runtimeUrl = [regex]::Replace($runtimeUrl, '([?&])pool_timeout=[^&]*', '$1pool_timeout=30')
  }
  else {
    $runtimeUrl += '&pool_timeout=30'
  }
  $runtimeUri = [Uri]$runtimeUrl
  if ($runtimeUri.DnsSafeHost -ne "db.$($expectedStagingRef).supabase.co") {
    throw "The bounded staging runtime URL resolved to unexpected host '$($runtimeUri.DnsSafeHost)'."
  }
  $env:DATABASE_URL = $runtimeUrl
  Assert-StagingTarget
  Write-Host "Using the bounded staging QA runtime connection."
}

function Assert-LocalPortAvailable([int]$RequestedPort) {
  $existingListener = Get-NetTCPConnection -State Listen -LocalPort $RequestedPort -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $existingListener) {
    throw "Local port $RequestedPort is already in use. Stop the current JinaCampus server, then rerun the GradeBook staging launcher."
  }

  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $RequestedPort)
  try {
    $probe.Start()
  }
  catch {
    throw "Local port $RequestedPort is already in use. Stop the current JinaCampus server, then rerun the GradeBook staging launcher."
  }
  finally {
    $probe.Stop()
  }
}

function Invoke-Prisma([string[]]$Arguments) {
  Assert-StagingTarget
  & $prisma @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma command failed with exit code $LASTEXITCODE."
  }
}

function Invoke-SyntheticRecoveryProvision([string]$Email, [string]$DisplayName) {
  if ($env:NODE_ENV -eq "production" -or $env:DEV_DEMO_SEED_ENABLED -ne "true") {
    throw "Synthetic recovery provisioning is restricted to non-production staging."
  }
  if ([string]::IsNullOrWhiteSpace($env:DEV_DEMO_USER_PASSWORD)) {
    throw "DEV_DEMO_USER_PASSWORD is required for synthetic recovery QA."
  }
  $env:PLATFORM_ADMIN_BOOTSTRAP_ENABLED = "true"
  $env:PLATFORM_ADMIN_EMAIL = $Email
  $env:PLATFORM_ADMIN_TEMP_PASSWORD = $env:DEV_DEMO_USER_PASSWORD
  $env:PLATFORM_ADMIN_DISPLAY_NAME = $DisplayName
  try {
    & node --import tsx (Join-Path $PSScriptRoot "provision-platform-administrator.ts")
    if ($LASTEXITCODE -ne 0) {
      throw "Synthetic recovery administrator provisioning failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Remove-Item Env:PLATFORM_ADMIN_BOOTSTRAP_ENABLED -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_TEMP_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_DISPLAY_NAME -ErrorAction SilentlyContinue
  }
}

function Invoke-SyntheticRecoveryAccess([string]$Email, [ValidateSet("grant", "revoke")][string]$Access) {
  $env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_AUTHORIZATION_ENABLED = "true"
  $env:PLATFORM_ADMIN_EMAIL = $Email
  $env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_ACCESS = $Access
  $env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_CONFIRM = "CONFIRM_PRINCIPAL_RECOVERY_ACCESS_CHANGE"
  try {
    & node --import tsx (Join-Path $PSScriptRoot "set-platform-principal-recovery-access.ts")
    if ($LASTEXITCODE -ne 0) {
      throw "Synthetic recovery authorization failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Remove-Item Env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_AUTHORIZATION_ENABLED -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_ACCESS -ErrorAction SilentlyContinue
    Remove-Item Env:PLATFORM_ADMIN_PRINCIPAL_RECOVERY_CONFIRM -ErrorAction SilentlyContinue
  }
}

Import-ProtectedEnvironment $EnvironmentFile
Assert-StagingTarget
$script:protectedStagingRuntimeUrl = $env:DATABASE_URL
Use-StagingDirectConnection

$resolvedSchema = (Resolve-Path (Join-Path $root $SchemaPath)).Path

switch ($Command) {
  "AssertTarget" { break }
  "Connectivity" {
    Assert-StagingTarget
    & $prisma db execute --schema $resolvedSchema --file $connectivitySql
    if ($LASTEXITCODE -ne 0) {
      throw "Staging database connectivity check failed with exit code $LASTEXITCODE."
    }
  }
  "ResetApplicationSchema" {
    Invoke-Prisma @("db", "execute", "--schema", $resolvedSchema, "--file", $resetSql)
  }
  "Status" {
    Assert-StagingTarget
    $statusOutput = & $prisma migrate status --schema $resolvedSchema 2>&1
    $statusCode = $LASTEXITCODE
    $statusOutput | ForEach-Object { Write-Host $_ }
    if ($statusCode -notin @(0, 1)) {
      throw "Prisma migrate status failed with exit code $statusCode."
    }
    Write-Host "Prisma migration status exit code: $statusCode."
  }
  "ExpectedGradebookPending" {
    Assert-StagingTarget
    $statusOutput = & $prisma migrate status --schema $resolvedSchema 2>&1
    $statusCode = $LASTEXITCODE
    $statusOutput | ForEach-Object { Write-Host $_ }
    $joinedOutput = $statusOutput -join "`n"
    if ($statusCode -ne 1 -or $joinedOutput -notmatch "20260811201500_expand_gradebook_phase_0_1") {
      throw "Expected exactly the expanded GradeBook migration to be pending."
    }
  }
  "Deploy" {
    Invoke-Prisma @("migrate", "deploy", "--schema", $resolvedSchema)
  }
  "Generate" {
    Invoke-Prisma @("generate", "--schema", $resolvedSchema)
  }
  "Seed" {
    if ($env:NODE_ENV -eq "production") {
      throw "Synthetic staging seed is forbidden with NODE_ENV=production."
    }
    foreach ($name in @("PASSWORD_PEPPER", "SEED_ADMIN_EMAIL", "SEED_ADMIN_TEMP_PASSWORD", "DEV_DEMO_USER_PASSWORD")) {
      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
        throw "$name is required for the synthetic staging seed."
      }
    }
    if ($env:DEV_DEMO_SEED_ENABLED -ne "true") {
      throw "DEV_DEMO_SEED_ENABLED must be true for the synthetic staging seed."
    }
    Invoke-Prisma @("generate", "--schema", $resolvedSchema)
    $seedPath = Join-Path (Split-Path $resolvedSchema -Parent) "seed.ts"
    if (-not (Test-Path -LiteralPath $seedPath -PathType Leaf)) {
      throw "The selected baseline does not contain prisma/seed.ts."
    }
    Push-Location (Split-Path (Split-Path $resolvedSchema -Parent) -Parent)
    try {
      & node --import tsx $seedPath
      if ($LASTEXITCODE -ne 0) {
        throw "Synthetic staging seed failed with exit code $LASTEXITCODE."
      }
    }
    finally {
      Pop-Location
    }
  }
  "Drift" {
    Invoke-Prisma @(
      "migrate", "diff",
      "--from-schema-datamodel", $resolvedSchema,
      "--to-schema-datasource", $resolvedSchema,
      "--exit-code"
    )
  }
  "Audit" {
    Assert-StagingTarget
    & node --import tsx (Join-Path $PSScriptRoot "audit-gradebook-staging-catalog.ts") --schema $resolvedSchema
    if ($LASTEXITCODE -ne 0) {
      throw "Staging catalog audit failed with exit code $LASTEXITCODE."
    }
  }
  "PilotPrepare" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") prepare
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging pilot preparation failed with exit code $LASTEXITCODE."
    }
  }
  "PilotVerify" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") verify
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging pilot verification failed with exit code $LASTEXITCODE."
    }
  }
  "PilotDisable" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") disable
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging pilot disable failed with exit code $LASTEXITCODE."
    }
  }
  "PilotInspect" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") inspect
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging pilot inspection failed with exit code $LASTEXITCODE."
    }
  }
  "PilotLocalReady" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") local-ready
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging local UI readiness check failed with exit code $LASTEXITCODE."
    }
  }
  "StorageAssert" {
    Assert-StagingStorageEnvironment
  }
  "StorageProbe" {
    Assert-StagingStorageEnvironment
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-storage-probe.ts")
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging storage probe failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryPrepare" {
    Use-StagingQaRuntimeConnection
    Invoke-SyntheticRecoveryProvision "gradebook-release-operator@qa.invalid" "Principal Recovery Staging Operator"
    Invoke-SyntheticRecoveryProvision "principal-recovery-observer@qa.invalid" "Principal Recovery Staging Observer"
    Invoke-SyntheticRecoveryAccess "gradebook-release-operator@qa.invalid" "grant"
    Invoke-SyntheticRecoveryAccess "principal-recovery-observer@qa.invalid" "revoke"
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") prepare
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery staging preparation failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryInspect" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") inspect
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery staging inspection failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryExpireLatestPilot" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") expire-latest-pilot
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery staging expiry preparation failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryExpireActiveSynthetic" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") expire-active-synthetic
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery staging synthetic cleanup failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryVerify" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") verify
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery staging verification failed with exit code $LASTEXITCODE."
    }
  }
  "RecoveryRestoreSyntheticPasswords" {
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "principal-recovery-staging-qa.ts") restore-synthetic-passwords
    if ($LASTEXITCODE -ne 0) {
      throw "Principal recovery synthetic credential restoration failed with exit code $LASTEXITCODE."
    }
  }
  "DevServer" {
    if ($env:NODE_ENV -eq "production") {
      throw "The staging QA development server cannot run with NODE_ENV=production."
    }
    Assert-LocalPortAvailable $Port
    Assert-StagingStorageEnvironment
    Use-StagingQaRuntimeConnection
    & node --import tsx (Join-Path $PSScriptRoot "gradebook-staging-pilot.ts") local-ready
    if ($LASTEXITCODE -ne 0) {
      throw "GradeBook staging local UI readiness check failed with exit code $LASTEXITCODE."
    }
    $localOrigin = "http://localhost:$Port"
    $env:APP_URL = $localOrigin
    $env:WEBAUTHN_ORIGIN = $localOrigin
    $env:WEBAUTHN_RP_ID = "localhost"
    Push-Location $root
    try {
      $devArguments = @("run", "dev:raw", "--", "--hostname", "127.0.0.1", "--port", $Port.ToString())
      if ($UseWebpack) {
        $devArguments += "--webpack"
      }
      & npm.cmd @devArguments
      if ($LASTEXITCODE -ne 0) {
        throw "The staging QA development server stopped with exit code $LASTEXITCODE."
      }
    }
    finally {
      Pop-Location
    }
  }
}
