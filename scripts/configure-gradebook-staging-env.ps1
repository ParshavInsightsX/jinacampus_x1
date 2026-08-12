[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $env:LOCALAPPDATA "JinaCampus\secrets\.env.gradebook-staging.local")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$stagingProjectRef = "clmbwnulotrviqvnwvvj"
$productionProjectRef = "jcqpmdslmydxjsfdwenc"
$directHost = "db.$stagingProjectRef.supabase.co"
$secretsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "JinaCampus\secrets"))
$secretsRootPrefix = $secretsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath($OutputPath)

if (-not $target.StartsWith($secretsRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The staging environment file must stay inside the protected local JinaCampus secrets directory."
}

if (-not $target.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase)) {
  throw "The staging environment filename must end in .local so Git ignores it."
}

if ($stagingProjectRef -eq $productionProjectRef) {
  throw "The staging and production project references must be different."
}

[IO.Directory]::CreateDirectory($secretsRoot) | Out-Null

$securePassword = Read-Host "Enter the gradebook-mvp-staging database password" -AsSecureString
$passwordPointer = [IntPtr]::Zero
$plainPassword = $null
$randomBytes = $null
$randomNumberGenerator = $null

try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw "A non-empty staging database password is required."
  }

  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $randomBytes = New-Object byte[] 48
  $randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  $randomNumberGenerator.GetBytes($randomBytes)
  $passwordPepper = [Convert]::ToBase64String($randomBytes)
  $randomNumberGenerator.GetBytes($randomBytes)
  $sessionSecret = [Convert]::ToBase64String($randomBytes)
  $randomNumberGenerator.GetBytes($randomBytes)
  $seedAdminPassword = "Qa!" + [Convert]::ToBase64String($randomBytes).Replace("/", "x").Replace("+", "y").Substring(0, 24)
  $randomNumberGenerator.GetBytes($randomBytes)
  $seedUserPassword = "Qa!" + [Convert]::ToBase64String($randomBytes).Replace("/", "x").Replace("+", "y").Substring(0, 24)

  $runtimeUrl = "postgresql://postgres`:$encodedPassword@$directHost`:5432/postgres?connection_limit=1&sslmode=require"
  $directUrl = $runtimeUrl

  $lines = @(
    "GRADEBOOK_STAGING_PROJECT_REF=$stagingProjectRef",
    "DATABASE_URL=`"$runtimeUrl`"",
    "DIRECT_URL=`"$directUrl`"",
    "APP_URL=`"http://localhost:3000`"",
    "NODE_ENV=development",
    "PASSWORD_PEPPER=`"$passwordPepper`"",
    "SESSION_SECRET=`"$sessionSecret`"",
    "COMMERCIAL_BOOTSTRAP_ENABLED=false",
    "DEV_DEMO_SEED_ENABLED=true",
    "SEED_ADMIN_EMAIL=staging-principal@gradebook.qa.invalid",
    "SEED_ADMIN_TEMP_PASSWORD=`"$seedAdminPassword`"",
    "DEV_DEMO_USER_PASSWORD=`"$seedUserPassword`"",
    "DEV_DEMO_STAFF_PASSWORD=`"$seedUserPassword`""
  )

  [IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new(
    $identity,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $target -AclObject $acl

  Write-Host "Protected staging environment created outside the repository. No secret was printed or copied."
}
finally {
  $plainPassword = $null
  if ($null -ne $randomBytes) {
    [Array]::Clear($randomBytes, 0, $randomBytes.Length)
  }
  if ($null -ne $randomNumberGenerator) {
    $randomNumberGenerator.Dispose()
  }
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}
