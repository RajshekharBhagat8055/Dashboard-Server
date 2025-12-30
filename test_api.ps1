# Test script for API endpoints
$baseUrl = "http://localhost:3000"

# Create a web session to maintain cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Login as super distributor
Write-Host "🔐 Logging in as super_distributor..." -ForegroundColor Yellow
$loginBody = @{
    username = "super_distributor"
    password = "super123"
} | ConvertTo-Json

$loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -WebSession $session -UseBasicParsing
$loginData = $loginResponse.Content | ConvertFrom-Json

if ($loginData.success) {
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "User: $($loginData.data.user.username) ($($loginData.data.user.role))" -ForegroundColor Cyan

    # Test distributors endpoint
    Write-Host "`n📊 Testing distributors endpoint..." -ForegroundColor Yellow
    try {
        $distributorsResponse = Invoke-WebRequest -Uri "$baseUrl/api/users/distributors" -Method GET -WebSession $session -UseBasicParsing
        $distributorsData = $distributorsResponse.Content | ConvertFrom-Json

        if ($distributorsData.success) {
            Write-Host "✅ Distributors endpoint working!" -ForegroundColor Green
            Write-Host "Found $($distributorsData.count) distributors" -ForegroundColor Cyan
            Write-Host "Data: $($distributorsData.data | ConvertTo-Json -Depth 2)" -ForegroundColor White
        } else {
            Write-Host "❌ API Error: $($distributorsData.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Request failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        $streamReader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseContent = $streamReader.ReadToEnd()
        $streamReader.Close()
        Write-Host "Response: $responseContent" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Login failed: $($loginData.message)" -ForegroundColor Red
}
