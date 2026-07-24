# Rapid7 Inventory Manager Docker Orchestration Setup Script
# Automates production build, network provisioning, and container deployment.

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     R7 INVENTORY MANAGER - ISOLATED DOCKER DEPLOYMENT" -ForegroundColor Blue
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker Daemon availability
Write-Host "[1/3] Verifying Docker Daemon installation..." -ForegroundColor Yellow
& docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Docker is not running or not installed. Please launch Docker Desktop before continuing."
    Exit
}
Write-Host "[OK] Docker Daemon is active." -ForegroundColor Green
Write-Host ""

# 2. Spin up docker-compose stack
Write-Host "[2/3] Building isolated database, backend and frontend container stack..." -ForegroundColor Yellow
& docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Compose failed to instantiate container stack."
    Exit
}
Write-Host "[OK] Docker Compose stack is active." -ForegroundColor Green
Write-Host ""

# 3. Success summary
Write-Host "[3/3] Portal environments online. Active endpoints:" -ForegroundColor Yellow
Write-Host "  -> Portal HTTP Redirect : http://localhost:81" -ForegroundColor Green
Write-Host "  -> Portal HTTPS Portal  : https://localhost:4546" -ForegroundColor Green
Write-Host ""
Write-Host "Instructions:" -ForegroundColor White
Write-Host "  1. Click 'Criar Conta Tenant' to register a new tenant." -ForegroundColor Cyan
Write-Host "  2. Save the generated credentials and log in." -ForegroundColor Cyan
Write-Host "  3. Access profile settings to set up MFA." -ForegroundColor Cyan
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Deployment completed successfully." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
