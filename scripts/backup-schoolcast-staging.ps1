[CmdletBinding()]
param(
  [string]$EnvironmentFile = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedStagingRef = "clmbwnulotrviqvnwvvj"
$productionRef = "jcqpmdslmydxjsfdwenc"
$postgresImage = "postgres@sha256:d4bb0a8c1b7bb2e29f976d099e7bfb9a5d8858cffe9e46b35cd302cd1f1f8168"
$stagingPoolerHost = "aws-0-ap-northeast-2.pooler.supabase.com"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupRoot = Join-Path $root ".tmp\schoolcast-staging-backups"
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$tempEnvFile = $null
$restoreContainer = $null
$rehearsalStartedAt = [DateTime]::UtcNow
$totalStopwatch = [Diagnostics.Stopwatch]::StartNew()

function Import-ProtectedEnvironment([string]$Path) {
  $candidate = [IO.Path]::GetFullPath($Path)
  if (-not $candidate.StartsWith($secretsPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      -not $candidate.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase)) {
    throw "The staging environment must be a protected .local file."
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "The protected staging environment file is missing."
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

function Get-ProjectRef([string]$Value, [string]$Name) {
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

function Assert-StagingTarget {
  if ($env:GRADEBOOK_STAGING_PROJECT_REF -ne $expectedStagingRef) {
    throw "The configured staging project reference is not approved."
  }
  $databaseRef = Get-ProjectRef $env:DATABASE_URL "DATABASE_URL"
  $directRef = Get-ProjectRef $env:DIRECT_URL "DIRECT_URL"
  if ($databaseRef -eq $productionRef -or $directRef -eq $productionRef) {
    throw "Production target detected. Backup refused."
  }
  if ($databaseRef -ne $expectedStagingRef -or $directRef -ne $expectedStagingRef) {
    throw "Both database URLs must target the approved staging project."
  }
}

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed with exit code $LASTEXITCODE."
  }
}

try {
  Import-ProtectedEnvironment $EnvironmentFile
  Assert-StagingTarget
  New-Item -ItemType Directory -Force $backupRoot | Out-Null

  $timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $backupName = "schoolcast-pre-migration-$timestamp.dump"
  $backupPath = Join-Path $backupRoot $backupName
  $manifestPath = "$backupPath.sha256.json"
  $tempEnvFile = Join-Path $backupRoot ".pg-$([Guid]::NewGuid().ToString('N')).env"
  $directUri = [Uri]$env:DIRECT_URL
  $directUserInfo = $directUri.UserInfo.Split(":", 2)
  if ($directUserInfo.Count -ne 2 -or [string]::IsNullOrWhiteSpace($directUserInfo[1])) {
    throw "The approved staging DIRECT_URL does not contain database credentials."
  }
  $pgDumpUrl = "postgresql://postgres.$expectedStagingRef`:$($directUserInfo[1])@$stagingPoolerHost`:5432/postgres?sslmode=require"
  [IO.File]::WriteAllText(
    $tempEnvFile,
    "PGURI=$pgDumpUrl$([Environment]::NewLine)BACKUP_NAME=$backupName$([Environment]::NewLine)",
    [Text.UTF8Encoding]::new($false)
  )

  $backupStartedAt = [DateTime]::UtcNow
  $backupStopwatch = [Diagnostics.Stopwatch]::StartNew()
  Invoke-Docker @(
    "run", "--rm",
    "--env-file", $tempEnvFile,
    "--mount", "type=bind,source=$backupRoot,target=/backup",
    $postgresImage,
    "sh",
    "-c",
    'exec pg_dump --dbname="$PGURI" --schema=public --format=custom --no-owner --no-privileges --file="/backup/$BACKUP_NAME"'
  )
  $backupStopwatch.Stop()
  $backupCompletedAt = [DateTime]::UtcNow

  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf) -or (Get-Item $backupPath).Length -le 0) {
    throw "The staging backup file was not created."
  }

  Invoke-Docker @(
    "run", "--rm",
    "--mount", "type=bind,source=$backupRoot,target=/backup,readonly",
    $postgresImage,
    "pg_restore",
    "--list",
    "/backup/$backupName"
  ) | Out-Null

  $restoreStartedAt = [DateTime]::UtcNow
  $restoreStopwatch = [Diagnostics.Stopwatch]::StartNew()
  $restorePasswordBytes = New-Object byte[] 36
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($restorePasswordBytes) } finally { $rng.Dispose() }
  $restorePassword = [Convert]::ToBase64String($restorePasswordBytes)
  $restoreContainer = "jinacampus-schoolcast-restore-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
  Invoke-Docker @(
    "run", "--detach",
    "--name", $restoreContainer,
    "--env", "POSTGRES_PASSWORD=$restorePassword",
    "--mount", "type=bind,source=$backupRoot,target=/backup,readonly",
    $postgresImage
  ) | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec $restoreContainer pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "The isolated restore-verification database did not become ready." }

  Invoke-Docker @("exec", $restoreContainer, "createdb", "-U", "postgres", "schoolcast_restore_check")
  Invoke-Docker @("exec", $restoreContainer, "psql", "-U", "postgres", "-d", "schoolcast_restore_check", "-c", "DROP SCHEMA public CASCADE;")
  Invoke-Docker @(
    "exec", $restoreContainer,
    "pg_restore",
    "-U", "postgres",
    "--dbname=schoolcast_restore_check",
    "--exit-on-error",
    "/backup/$backupName"
  )
  $migrationCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;').Trim()
  $failedMigrationCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL;').Trim()
  $tenantCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc 'SELECT count(*) FROM "tenants";').Trim()
  $tableCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';").Trim()
  $foreignKeyCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f';").Trim()
  $invalidIndexCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT i.indisvalid;").Trim()
  $unvalidatedConstraintCount = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated;").Trim()
  $schoolCastTablePresent = (& docker exec $restoreContainer psql -U postgres -d schoolcast_restore_check -Atc "SELECT to_regclass('public.schoolcast_communications') IS NOT NULL;").Trim()
  if (
    $LASTEXITCODE -ne 0 -or
    [int]$migrationCount -lt 1 -or
    [int]$failedMigrationCount -ne 0 -or
    [int]$tenantCount -lt 1 -or
    [int]$tableCount -lt 1 -or
    [int]$foreignKeyCount -lt 1 -or
    [int]$invalidIndexCount -ne 0 -or
    [int]$unvalidatedConstraintCount -ne 0 -or
    $schoolCastTablePresent -ne "t"
  ) {
    throw "The isolated staging restore verification did not contain the expected application baseline."
  }
  $restoreStopwatch.Stop()
  $restoreCompletedAt = [DateTime]::UtcNow
  $totalStopwatch.Stop()

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $backupSizeBytes = (Get-Item -LiteralPath $backupPath).Length
  $manifest = [ordered]@{
    evidenceVersion = 2
    environment = "STAGING"
    projectRef = $expectedStagingRef
    recoveryScope = "PUBLIC_SCHEMA_LOGICAL_BACKUP"
    rehearsalStartedAtUtc = $rehearsalStartedAt.ToString("o")
    backupStartedAtUtc = $backupStartedAt.ToString("o")
    backupCompletedAtUtc = $backupCompletedAt.ToString("o")
    restoreStartedAtUtc = $restoreStartedAt.ToString("o")
    restoreCompletedAtUtc = $restoreCompletedAt.ToString("o")
    completedAtUtc = [DateTime]::UtcNow.ToString("o")
    backupDurationSeconds = [Math]::Round($backupStopwatch.Elapsed.TotalSeconds, 3)
    restoreDurationSeconds = [Math]::Round($restoreStopwatch.Elapsed.TotalSeconds, 3)
    totalDurationSeconds = [Math]::Round($totalStopwatch.Elapsed.TotalSeconds, 3)
    backupFile = $backupName
    backupSizeBytes = $backupSizeBytes
    sha256 = $hash
    verifiedWithPgRestore = $true
    verifiedWithIsolatedRestore = $true
    appliedMigrationCount = [int]$migrationCount
    failedMigrationCount = [int]$failedMigrationCount
    tenantCount = [int]$tenantCount
    publicTableCount = [int]$tableCount
    foreignKeyCount = [int]$foreignKeyCount
    invalidIndexCount = [int]$invalidIndexCount
    unvalidatedConstraintCount = [int]$unvalidatedConstraintCount
    schoolCastSchemaPresent = $true
    containsSyntheticStagingData = $true
    continuousRecoveryEnabled = $false
    offsiteCopyVerified = $false
    storageObjectsIncluded = $false
    approvedRpoTargetMinutes = 15
    approvedRtoTargetMinutes = 240
    productionRpoCertified = $false
    productionRtoCertified = $false
    productionRecoveryGate = "BLOCKED"
  }
  [IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 3),
    [Text.UTF8Encoding]::new($false)
  )
  Write-Host "Verified staging backup and isolated restore: $backupName"
  Write-Host "Backup manifest: $([IO.Path]::GetFileName($manifestPath))"
}
finally {
  if ($restoreContainer) {
    & docker rm --force $restoreContainer 2>$null | Out-Null
  }
  if ($tempEnvFile -and (Test-Path -LiteralPath $tempEnvFile)) {
    Remove-Item -LiteralPath $tempEnvFile -Force
  }
}
