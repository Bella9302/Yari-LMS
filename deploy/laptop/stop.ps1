# Stops the laptop demo. The demo data is kept for next time.
# To wipe it and start fresh: docker compose -f docker-compose.laptop.yml --env-file .env.laptop down -v
Set-Location (Join-Path $PSScriptRoot "..\..")
& docker compose -f docker-compose.laptop.yml --env-file .env.laptop stop
Write-Host "Stopped. The link no longer works. Run deploy\laptop\start.ps1 to start again."
