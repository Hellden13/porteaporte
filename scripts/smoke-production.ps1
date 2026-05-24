$ErrorActionPreference = "Stop"

$baseUrl = "https://porteaporte.site"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure($Message) {
  $script:failures.Add($Message) | Out-Null
  Write-Host "FAIL $Message" -ForegroundColor Red
}

function Assert-Status($Label, $Method, $Url, $Expected, $Body = $null) {
  try {
    $params = @{
      Uri = $Url
      Method = $Method
      TimeoutSec = 25
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $params.ContentType = "application/json"
      $params.Body = ($Body | ConvertTo-Json -Compress)
    }
    $res = Invoke-WebRequest @params
    $status = [int]$res.StatusCode
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    } else {
      Add-Failure "$Label unreachable: $($_.Exception.Message)"
      return
    }
  }

  if ($Expected -notcontains $status) {
    Add-Failure "$Label expected $($Expected -join '/') got $status"
  } else {
    Write-Host "OK   $Label $status" -ForegroundColor Green
  }
}

Write-Host "PorteaPorte production smoke tests: $baseUrl" -ForegroundColor Cyan

$pages = @(
  "/",
  "/login.html",
  "/signup.html",
  "/role-choice.html",
  "/expediteur.html",
  "/livreur.html",
  "/create-mission.html",
  "/paiement.html",
  "/dashboard-expediteur.html",
  "/dashboard-livreur.html",
  "/confirmation-destinataire.html",
  "/transparence.html",
  "/faq.html",
  "/cgu.html",
  "/admin/login.html",
  "/admin/dashboard-admin.html"
)

foreach ($page in $pages) {
  Assert-Status "page $page" "GET" "$baseUrl$page" @(200)
}

$protectedPlatform = @(
  "available-livraisons",
  "admin-dashboard",
  "gps-update",
  "create-livraison",
  "assign-driver",
  "impact-admin",
  "admin-rewards",
  "draw-enter"
)

foreach ($endpoint in $protectedPlatform) {
  Assert-Status "protected platform $endpoint" "POST" "$baseUrl/api/platform" @(401) @{ endpoint = $endpoint }
}

Assert-Status "public platform impact-public" "POST" "$baseUrl/api/platform" @(200) @{ endpoint = "impact-public" }
Assert-Status "public platform ride-search" "POST" "$baseUrl/api/platform" @(200) @{ endpoint = "ride-search" }
Assert-Status "public tracking missing code" "POST" "$baseUrl/api/platform" @(400) @{ endpoint = "tracking-public" }

Assert-Status "payment without session" "POST" "$baseUrl/api/paiement-livraison" @(401) @{ livraison_id = "test" }
Assert-Status "cancel without session" "POST" "$baseUrl/api/cancel-livraison" @(401) @{ livraison_id = "test" }
Assert-Status "capture missing livraison" "POST" "$baseUrl/api/capture-livraison" @(400) @{}
Assert-Status "stripe webhook unsigned" "POST" "$baseUrl/api/stripe-webhook" @(400) @{}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Smoke tests failed: $($failures.Count)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
  exit 1
}

Write-Host ""
Write-Host "Smoke tests passed." -ForegroundColor Green
