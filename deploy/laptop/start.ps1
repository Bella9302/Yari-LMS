# Starts the YARI Academy demo on this laptop and shares it through a free, temporary
# Cloudflare link. From the project folder, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File deploy\laptop\start.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")

$EnvFile = ".env.laptop"
$Logins = "deploy\laptop\demo-logins.txt"
function Compose { & docker compose -f docker-compose.laptop.yml --env-file $EnvFile @args }
function Say($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function RandomBase64($bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b)
}
function RandomHex($bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker isn't running. Open Docker Desktop, wait until it shows 'Engine running', then run this again."
  exit 1
}

if (-not (Test-Path $EnvFile)) {
  Say "First run: creating private keys for this laptop ($EnvFile)"
  $keyId = "k" + (Get-Date -Format "yyyyMMdd")
  $lines = @(
    "POSTGRES_PASSWORD=$(RandomHex 24)",
    "FIELD_ENC_KEYS='{""$keyId"":""$(RandomBase64 32)""}'",
    "FIELD_ENC_ACTIVE_KEY=$keyId",
    "BLIND_INDEX_KEY=$(RandomBase64 32)",
    "DEMO_PASSWORD=Demo-$(RandomHex 4)"
  )
  # ASCII, not UTF-8: Windows PowerShell would add a byte-order mark that Docker can't read.
  Set-Content -Path $EnvFile -Value $lines -Encoding ascii
}
$demoPassword = ((Get-Content $EnvFile | Where-Object { $_ -like "DEMO_PASSWORD=*" }) -split "=", 2)[1]

Say "Opening the Cloudflare link"
Compose up -d db tunnel
$url = $null
for ($i = 0; $i -lt 45 -and -not $url; $i++) {
  $logs = (Compose logs tunnel 2>$null | Out-String)
  $found = [regex]::Matches($logs, "https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com")
  if ($found.Count -gt 0) { $url = $found[$found.Count - 1].Value } else { Start-Sleep -Seconds 2 }
}
if (-not $url) {
  Write-Host "Couldn't open a Cloudflare link (check the internet connection). Continuing on this laptop only."
  $url = "http://localhost:3000"
}
$env:APP_URL = $url

Say "Starting YARI Academy (the first time takes 5-10 minutes)"
Compose up -d --build app
Write-Host -NoNewline "Waiting for it to be ready"
for ($i = 0; $i -lt 120; $i++) {
  $id = (Compose ps -q app | Out-String).Trim()
  $state = (& docker inspect -f "{{.State.Health.Status}}" $id 2>$null | Out-String).Trim()
  if ($state -eq "healthy") { break }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 3
}
Write-Host ""

$output = (Compose exec -T -e "DEMO_PASSWORD=$demoPassword" app npm run --silent db:seed:demo 2>&1 | Out-String)
if ($output -match "Demo data created") {
  Set-Content -Path $Logins -Value $output -Encoding ascii
  Say "Demo data loaded. Logins saved to $Logins"
}

Say "Ready"
Write-Host "  Share this link:   $url"
Write-Host "  On this laptop:    http://localhost:3000"
Write-Host "  Logins:            $Logins"
Write-Host ""
Write-Host "  Keep this laptop on, awake and online while presenting."
Write-Host "  If it sleeps or changes network, run this script again: the link will change."
Write-Host "  To stop:           powershell -ExecutionPolicy Bypass -File deploy\laptop\stop.ps1"
Start-Process $url
