[CmdletBinding()]
param(
  [string]$EnvironmentFile = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$stagingRef = "clmbwnulotrviqvnwvvj"
$productionRef = "jcqpmdslmydxjsfdwenc"
$target = [IO.Path]::GetFullPath($EnvironmentFile)
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Project-Ref([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Name is required." }
  try { $uri = [Uri]$Value } catch { throw "$Name is not a valid PostgreSQL URL." }
  $hostName = $uri.DnsSafeHost.ToLowerInvariant()
  $userName = [Uri]::UnescapeDataString(($uri.UserInfo.Split(":", 2))[0]).ToLowerInvariant()
  if ($hostName -match "^db\.([a-z0-9]+)\.supabase\.co$") { return $Matches[1] }
  if ($hostName.EndsWith(".pooler.supabase.com") -and $userName -match "^postgres\.([a-z0-9]+)$") {
    return $Matches[1]
  }
  throw "$Name does not identify a Supabase project."
}

function Set-Entry(
  [System.Collections.Generic.List[string]]$Lines,
  [string]$Name,
  [string]$Value
) {
  $replacement = "$Name=$Value"
  for ($index = 0; $index -lt $Lines.Count; $index += 1) {
    if ($Lines[$index] -match "^\s*$([regex]::Escape($Name))\s*=") {
      $Lines[$index] = $replacement
      return
    }
  }
  $Lines.Add($replacement)
}

function New-Secret {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

if (-not $target.StartsWith($secretsPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not $target.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Use the existing protected staging .local environment file."
}

$existing = @{}
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($rawLine in [IO.File]::ReadAllLines($target)) {
  $lines.Add($rawLine)
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith("#")) { continue }
  $pair = $line.Split("=", 2)
  if ($pair.Count -ne 2) { continue }
  $value = $pair[1].Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $existing[$pair[0]] = $value
}

if ($existing["GRADEBOOK_STAGING_PROJECT_REF"] -ne $stagingRef) {
  throw "The protected environment does not target the approved staging project."
}
foreach ($name in @("DATABASE_URL", "DIRECT_URL")) {
  $ref = Project-Ref $existing[$name] $name
  if ($ref -eq $productionRef) { throw "Production database target detected. Operation refused." }
  if ($ref -ne $stagingRef) { throw "$name does not target the approved staging project." }
}
if ([string]::IsNullOrWhiteSpace($existing["SUPABASE_SERVICE_ROLE_KEY"])) {
  throw "The existing protected staging service-role key is required."
}
if ($existing["SUPABASE_URL"] -ne "https://$stagingRef.supabase.co") {
  throw "SUPABASE_URL does not target the approved staging project."
}
if ($existing.ContainsKey("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY") -and
    -not [string]::IsNullOrWhiteSpace($existing["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"])) {
  throw "The Supabase service-role key must remain server-only."
}

$dataKey = if ([string]::IsNullOrWhiteSpace($existing["SCHOOLCAST_DATA_ENCRYPTION_KEY"])) {
  New-Secret
} else {
  $existing["SCHOOLCAST_DATA_ENCRYPTION_KEY"]
}
$workerSecret = if ([string]::IsNullOrWhiteSpace($existing["SCHOOLCAST_WORKER_SECRET"])) {
  New-Secret
} else {
  $existing["SCHOOLCAST_WORKER_SECRET"]
}
function Quote-Value([string]$Value) { return '"' + $Value + '"' }

Set-Entry $lines "SCHOOLCAST_STAGING_PROJECT_REF" (Quote-Value $stagingRef)
Set-Entry $lines "SCHOOLCAST_RELEASE_SCOPE" (Quote-Value "FULL")
Set-Entry $lines "SCHOOLCAST_DATA_ENCRYPTION_KEY" (Quote-Value $dataKey)
Set-Entry $lines "SCHOOLCAST_STORAGE_BUCKET" (Quote-Value "schoolcast-private")
Set-Entry $lines "SCHOOLCAST_ATTACHMENT_MAX_BYTES" "10000000"
Set-Entry $lines "SCHOOLCAST_SIGNED_URL_TTL_SECONDS" "60"
Set-Entry $lines "SCHOOLCAST_WORKER_SECRET" (Quote-Value $workerSecret)
Set-Entry $lines "SCHOOLCAST_MALWARE_SCANNER_MODE" (Quote-Value "CLAMAV")
Set-Entry $lines "SCHOOLCAST_CLAMAV_HOST" (Quote-Value "127.0.0.1")
Set-Entry $lines "SCHOOLCAST_CLAMAV_PORT" "3310"
Set-Entry $lines "SCHOOLCAST_CLAMAV_TIMEOUT_MS" "12000"
Set-Entry $lines "SCHOOLCAST_SCAN_MAX_ATTEMPTS" "5"
Set-Entry $lines "SCHOOLCAST_RESEND_API_KEY" '""'
Set-Entry $lines "SCHOOLCAST_RESEND_WEBHOOK_SECRET" '""'
Set-Entry $lines "SCHOOLCAST_META_ACCESS_TOKEN" '""'
Set-Entry $lines "SCHOOLCAST_META_WEBHOOK_SECRET" '""'

[IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$grant = '*{0}:(F)' -f $sid
& icacls.exe $target /inheritance:r /grant:r $grant | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to protect the staging environment file." }

$acl = Get-Acl -LiteralPath $target
$rules = @($acl.Access)
$validRules = @($rules | Where-Object {
  $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
  $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid -and
  ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq
    [Security.AccessControl.FileSystemRights]::FullControl
})
if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1 -or $validRules.Count -ne 1) {
  throw "The protected staging environment ACL could not be verified."
}

Write-Host "SchoolCast staging storage and scanner environment configured privately."
Write-Host "External email and WhatsApp provider credentials remain disabled."
