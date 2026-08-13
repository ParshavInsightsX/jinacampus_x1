[CmdletBinding()]
param(
  [string]$EnvironmentFile = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$stagingProjectRef = "clmbwnulotrviqvnwvvj"
$productionProjectRef = "jcqpmdslmydxjsfdwenc"
$storageBucket = "gradebook-private"
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsRootPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath($EnvironmentFile)

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

function Set-EnvironmentEntry([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
  $replacement = "$Name=$Value"
  for ($index = 0; $index -lt $Lines.Count; $index += 1) {
    if ($Lines[$index] -match "^\s*$([regex]::Escape($Name))\s*=") {
      $Lines[$index] = $replacement
      return
    }
  }
  $Lines.Add($replacement)
}

if (-not $target.StartsWith($secretsRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The staging environment file must stay inside the protected local JinaCampus secrets directory."
}
if (-not $target.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase)) {
  throw "The staging environment filename must end in .local."
}
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Create the protected GradeBook staging database environment first."
}
if ($stagingProjectRef -eq $productionProjectRef) {
  throw "The staging and production project references must be different."
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
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $existing[$pair[0]] = $value
}

if ($existing["GRADEBOOK_STAGING_PROJECT_REF"] -ne $stagingProjectRef) {
  throw "The protected environment does not target the approved GradeBook staging project."
}
foreach ($name in @("DATABASE_URL", "DIRECT_URL")) {
  $projectRef = Get-ProjectRefFromDatabaseUrl $existing[$name] $name
  if ($projectRef -eq $productionProjectRef) {
    throw "Production database target detected. Operation refused."
  }
  if ($projectRef -ne $stagingProjectRef) {
    throw "$name does not target the approved GradeBook staging project."
  }
}

$secureKey = Read-Host "Enter the server-only Supabase secret/service-role key for gradebook-mvp-staging" -AsSecureString
$keyPointer = [IntPtr]::Zero
$plainKey = $null
try {
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey.Length -lt 20 -or $plainKey -match "\s") {
    throw "A valid non-empty staging server key is required."
  }

  Set-EnvironmentEntry $lines "SUPABASE_URL" "`"https://$stagingProjectRef.supabase.co`""
  Set-EnvironmentEntry $lines "SUPABASE_SERVICE_ROLE_KEY" "`"$plainKey`""
  Set-EnvironmentEntry $lines "GRADEBOOK_STORAGE_BUCKET" "`"$storageBucket`""
  Set-EnvironmentEntry $lines "GRADEBOOK_IMPORT_MAX_BYTES" "10000000"
  Set-EnvironmentEntry $lines "GRADEBOOK_REPORT_CARD_MAX_BYTES" "5000000"

  [IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $sid = $identity.User.Value
  $grant = '*{0}:(F)' -f $sid
  & icacls.exe $target /inheritance:r /grant:r $grant | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to protect the staging environment file."
  }

  $verifiedAcl = Get-Acl -LiteralPath $target
  $accessRules = @($verifiedAcl.Access)
  $matchingRules = @($accessRules | Where-Object {
    $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
    $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid -and
    ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq
      [Security.AccessControl.FileSystemRights]::FullControl
  })
  $unexpectedRules = @($accessRules | Where-Object {
    $_.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
    $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid
  })
  if (
    -not $verifiedAcl.AreAccessRulesProtected -or
    $accessRules.Count -ne 1 -or
    $matchingRules.Count -ne 1 -or
    $unexpectedRules.Count -gt 0
  ) {
    throw "The staging environment file ACL could not be verified."
  }

  Write-Host "GradeBook staging storage environment configured privately. No key was printed or copied."
}
finally {
  $plainKey = $null
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
}
