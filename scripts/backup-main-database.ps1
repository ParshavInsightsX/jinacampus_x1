[CmdletBinding()]
param(
  [string]$EnvironmentFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedProjectRef = "jcqpmdslmydxjsfdwenc"
$postgresImage = "postgres@sha256:d4bb0a8c1b7bb2e29f976d099e7bfb9a5d8858cffe9e46b35cd302cd1f1f8168"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) { $EnvironmentFile = Join-Path $root ".env" }
$expectedEnvironmentFile = [IO.Path]::GetFullPath((Join-Path $root ".env"))
$backupRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\backups\main"))
$dumpEnvFile = $null
$restoreEnvFile = $null
$restoreContainer = $null

function Import-MainEnvironment([string]$Path) {
  $candidate = [IO.Path]::GetFullPath($Path)
  if (-not $candidate.Equals($expectedEnvironmentFile, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Main database backup must use the repository .env file."
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "The main .env file is missing."
  }

  foreach ($rawLine in [IO.File]::ReadAllLines($candidate)) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $pair = $line.Split("=", 2)
    if ($pair.Count -ne 2 -or $pair[0] -notmatch "^[A-Z_][A-Z0-9_]*$") { continue }
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
  if ($Value -match "@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?/") { return $Matches[1] }
  if ($Value -match "^postgres(?:ql)?://postgres\.([a-z0-9]+):.+@[^/]+/") { return $Matches[1] }
  throw "$Name does not identify a Supabase project reference."
}

function Assert-MainTarget {
  $databaseRef = Get-ProjectRef $env:DATABASE_URL "DATABASE_URL"
  $directRef = Get-ProjectRef $env:DIRECT_URL "DIRECT_URL"
  if ($databaseRef -ne $expectedProjectRef -or $directRef -ne $expectedProjectRef) {
    throw "Both database URLs must target the approved main JinaCampus project."
  }
  if ($env:DATABASE_URL -notmatch "@[^/]*\.pooler\.supabase\.com:6543/") {
    throw "DATABASE_URL must use the main transaction pooler on port 6543."
  }
  if ($env:DIRECT_URL -notmatch "@db\.$expectedProjectRef\.supabase\.co:5432/") {
    throw "DIRECT_URL must use the main project direct host on port 5432."
  }
  if ($env:GRADEBOOK_STAGING_PROJECT_REF) {
    throw "Staging markers are not allowed during a main database backup."
  }
}

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed with exit code $LASTEXITCODE." }
}

try {
  Import-MainEnvironment $EnvironmentFile
  Assert-MainTarget

  New-Item -ItemType Directory -Force $backupRoot | Out-Null
  $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $backupRoot /inheritance:r /grant:r "${account}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to restrict the main backup directory ACL." }

  $timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $backupName = "jinacampus-main-backup-$timestamp.dump"
  $backupPath = Join-Path $backupRoot $backupName
  $manifestPath = "$backupPath.sha256.json"
  $dumpEnvFile = Join-Path $backupRoot ".pg-dump-$([Guid]::NewGuid().ToString('N')).env"
  $restoreEnvFile = Join-Path $backupRoot ".pg-restore-$([Guid]::NewGuid().ToString('N')).env"

  $runtimeBase = ($env:DATABASE_URL -split "\?", 2)[0]
  $pgDumpUrl = $runtimeBase -replace ":6543/", ":5432/"
  if ($pgDumpUrl -eq $runtimeBase) { throw "Unable to derive the main session-pooler backup URL." }
  $pgDumpUrl = "$pgDumpUrl`?sslmode=require"
  [IO.File]::WriteAllText(
    $dumpEnvFile,
    "PGURI=$pgDumpUrl$([Environment]::NewLine)BACKUP_NAME=$backupName$([Environment]::NewLine)",
    [Text.UTF8Encoding]::new($false)
  )

  $backupStartedAt = [DateTime]::UtcNow
  $backupStopwatch = [Diagnostics.Stopwatch]::StartNew()
  Invoke-Docker @(
    "run", "--rm",
    "--env-file", $dumpEnvFile,
    "--mount", "type=bind,source=$backupRoot,target=/backup",
    $postgresImage,
    "sh", "-c",
    'exec pg_dump --dbname="$PGURI" --schema=public --format=custom --no-owner --no-privileges --file="/backup/$BACKUP_NAME"'
  )
  $backupStopwatch.Stop()
  $backupCompletedAt = [DateTime]::UtcNow

  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf) -or (Get-Item $backupPath).Length -le 0) {
    throw "The main database backup file was not created."
  }
  Invoke-Docker @(
    "run", "--rm",
    "--mount", "type=bind,source=$backupRoot,target=/backup,readonly",
    $postgresImage,
    "pg_restore", "--list", "/backup/$backupName"
  ) | Out-Null

  $restorePasswordBytes = New-Object byte[] 36
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($restorePasswordBytes) } finally { $rng.Dispose() }
  $restorePassword = [Convert]::ToBase64String($restorePasswordBytes)
  [IO.File]::WriteAllText(
    $restoreEnvFile,
    "POSTGRES_PASSWORD=$restorePassword$([Environment]::NewLine)",
    [Text.UTF8Encoding]::new($false)
  )

  $restoreStartedAt = [DateTime]::UtcNow
  $restoreStopwatch = [Diagnostics.Stopwatch]::StartNew()
  $restoreContainer = "jinacampus-main-restore-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
  Invoke-Docker @(
    "run", "--detach", "--name", $restoreContainer,
    "--env-file", $restoreEnvFile,
    "--mount", "type=bind,source=$backupRoot,target=/backup,readonly",
    $postgresImage
  ) | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec $restoreContainer pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "The isolated restore database did not become ready." }

  Invoke-Docker @("exec", $restoreContainer, "createdb", "-U", "postgres", "jinacampus_restore_check")
  Invoke-Docker @("exec", $restoreContainer, "psql", "-U", "postgres", "-d", "jinacampus_restore_check", "-c", "DROP SCHEMA public CASCADE;")
  Invoke-Docker @(
    "exec", $restoreContainer, "pg_restore", "-U", "postgres",
    "--dbname=jinacampus_restore_check", "--exit-on-error", "/backup/$backupName"
  )

  $migrationCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;').Trim()
  $failedMigrationCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL;').Trim()
  $tenantCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc 'SELECT count(*) FROM "tenants";').Trim()
  $tableCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';").Trim()
  $foreignKeyCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f';").Trim()
  $invalidIndexCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT i.indisvalid;").Trim()
  $unvalidatedConstraintCount = (& docker exec $restoreContainer psql -U postgres -d jinacampus_restore_check -Atc "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated;").Trim()

  if (
    $LASTEXITCODE -ne 0 -or
    [int]$migrationCount -lt 1 -or
    [int]$failedMigrationCount -ne 0 -or
    [int]$tenantCount -lt 1 -or
    [int]$tableCount -lt 1 -or
    [int]$foreignKeyCount -lt 1 -or
    [int]$invalidIndexCount -ne 0 -or
    [int]$unvalidatedConstraintCount -ne 0
  ) {
    throw "The isolated restore did not match a supported main database schema state."
  }
  $restoreStopwatch.Stop()
  $restoreCompletedAt = [DateTime]::UtcNow

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    evidenceVersion = 1
    environment = "MAIN"
    projectRef = $expectedProjectRef
    recoveryScope = "PUBLIC_SCHEMA_LOGICAL_BACKUP"
    backupStartedAtUtc = $backupStartedAt.ToString("o")
    backupCompletedAtUtc = $backupCompletedAt.ToString("o")
    restoreStartedAtUtc = $restoreStartedAt.ToString("o")
    restoreCompletedAtUtc = $restoreCompletedAt.ToString("o")
    backupDurationSeconds = [Math]::Round($backupStopwatch.Elapsed.TotalSeconds, 3)
    restoreDurationSeconds = [Math]::Round($restoreStopwatch.Elapsed.TotalSeconds, 3)
    backupFile = $backupName
    backupSizeBytes = (Get-Item -LiteralPath $backupPath).Length
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
    storageObjectsIncluded = $false
  }
  [IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 3),
    [Text.UTF8Encoding]::new($false)
  )

  Write-Host "Verified protected main backup and isolated restore."
  Write-Host "Backup evidence: $backupName.sha256.json"
}
finally {
  if ($restoreContainer) { & docker rm --force $restoreContainer 2>$null | Out-Null }
  foreach ($path in @($dumpEnvFile, $restoreEnvFile)) {
    if ($path -and (Test-Path -LiteralPath $path)) { Remove-Item -LiteralPath $path -Force }
  }
}
