[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Start", "Assert", "Stop")]
  [string]$Command
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$containerName = "jinacampus-schoolcast-clamav-staging"
$volumeName = "jinacampus-schoolcast-clamav-db"
$image = "clamav/clamav@sha256:741e6c447241220e0792a901befcaec1d55a755c5097fc9cd88d7fd8be251a5c"

function Test-ClamAv {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.ConnectAsync("127.0.0.1", 3310)
    if (-not $connect.Wait(2000) -or -not $client.Connected) { return $false }
    $stream = $client.GetStream()
    $stream.ReadTimeout = 2000
    $payload = [Text.Encoding]::ASCII.GetBytes("zPING$([char]0)")
    $stream.Write($payload, 0, $payload.Length)
    $buffer = New-Object byte[] 32
    $count = $stream.Read($buffer, 0, $buffer.Length)
    if ($count -le 0) { return $false }
    $response = [Text.Encoding]::ASCII.GetString($buffer, 0, $count).Replace(([char]0).ToString(), "").Trim()
    return $response -eq "PONG"
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

if ($Command -eq "Stop") {
  & docker rm --force $containerName 2>$null | Out-Null
  Write-Host "Stopped the staging-only SchoolCast ClamAV container."
  exit 0
}

if ($Command -eq "Start") {
  [string]$existing = (& docker ps -a --filter "name=^/$containerName$" --format "{{.Names}}")
  if ($existing -and -not (Test-ClamAv)) {
    & docker rm --force $containerName 2>$null | Out-Null
  }
  [string]$running = (& docker ps --filter "name=^/$containerName$" --format "{{.Names}}")
  if ([string]::IsNullOrWhiteSpace($running)) {
    $dockerArguments = @(
      "run", "--detach",
      "--name", $containerName,
      "--restart=no",
      "--publish", "127.0.0.1:3310:3310",
      "--mount", "source=$volumeName,target=/var/lib/clamav",
      $image
    )
    & docker @dockerArguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to start the staging ClamAV container." }
  }

  $ready = $false
  for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
    if (Test-ClamAv) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    & docker logs --tail 50 $containerName
    throw "The staging ClamAV service did not become ready."
  }
}

if (-not (Test-ClamAv)) {
  throw "The staging ClamAV service is not healthy on 127.0.0.1:3310."
}
Write-Host "Verified staging-only ClamAV scanner readiness."
