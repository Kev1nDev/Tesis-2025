param(
  [int]$BackendPort = 3000,
  [int]$ExpoPort = 8083,
  [ValidateSet('lan','tunnel','localhost')]
  [string]$ExpoHost = 'lan'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$mobileDir = Join-Path $repoRoot 'mobile'
$mobileEnvPath = Join-Path $mobileDir '.env'

if (-not (Test-Path $backendDir)) { throw "No existe la carpeta: $backendDir" }
if (-not (Test-Path $mobileDir)) { throw "No existe la carpeta: $mobileDir" }

function Test-PortFree {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return -not $conn
  } catch {
    # If Get-NetTCPConnection isn't available for some reason, assume it's free.
    return $true
  }
}

function Find-FreePort {
  param([int]$StartPort, [int]$MaxTries = 20)
  for ($i = 0; $i -lt $MaxTries; $i++) {
    $p = $StartPort + $i
    if (Test-PortFree -Port $p) { return $p }
  }
  throw "No se encontró un puerto libre entre $StartPort y $($StartPort + $MaxTries - 1)."
}

$resolvedBackendPort = Find-FreePort -StartPort $BackendPort -MaxTries 20

Write-Host "Repo: $repoRoot"
Write-Host "Backend: http://0.0.0.0:$resolvedBackendPort" + $(if ($resolvedBackendPort -ne $BackendPort) { " (puerto $BackendPort ocupado)" } else { "" })
Write-Host "Expo (Metro): port $ExpoPort (host=$ExpoHost)"
Write-Host "" 

if (Test-Path $mobileEnvPath) {
  $envContent = Get-Content -LiteralPath $mobileEnvPath -Raw
  if ($envContent -match '(?m)^EXPO_PUBLIC_API_BASE_URL=(?<url>.+)$') {
    $currentUrl = $Matches['url'].Trim()
    try {
      $uri = [Uri]$currentUrl
      $newUrl = "{0}://{1}:{2}" -f $uri.Scheme, $uri.Host, $resolvedBackendPort
      if ($newUrl -ne $currentUrl) {
        $updated = $envContent -replace '(?m)^EXPO_PUBLIC_API_BASE_URL=.+$', ("EXPO_PUBLIC_API_BASE_URL=$newUrl")
        Set-Content -LiteralPath $mobileEnvPath -Value $updated -Encoding utf8
        Write-Host "Actualizado mobile/.env: EXPO_PUBLIC_API_BASE_URL=$newUrl"
        Write-Host ""
      }
    } catch {
      Write-Host "Aviso: no pude parsear EXPO_PUBLIC_API_BASE_URL en mobile/.env (no es una URL válida)." -ForegroundColor Yellow
    }
  }
}

# Helper to open a new PowerShell window.
function Start-PowerShellWindow {
  param(
    [Parameter(Mandatory=$true)][string]$Title,
    [Parameter(Mandatory=$true)][string]$Command
  )

  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  ) | Out-Null
}

# Start backend (dev watcher).
$backendCmd = @(
  "Set-Location -LiteralPath '$backendDir'",
  "`$env:PORT = $resolvedBackendPort",
  "npm install",
  "npm run dev"
) -join '; '

Start-PowerShellWindow -Title 'tesis-backend (dev)' -Command $backendCmd

# Start Expo without interactive port prompt.
$mobileCmd = @(
  "Set-Location -LiteralPath '$mobileDir'",
  "npm install",
  "npx expo start --clear --port $ExpoPort --host $ExpoHost"
) -join '; '

Start-PowerShellWindow -Title 'tesis-mobile (expo)' -Command $mobileCmd

Write-Host "Listo: se abrieron 2 ventanas (backend y Expo)."
Write-Host "Cierra esas ventanas para detenerlos." 
