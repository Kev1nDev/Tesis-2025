param(
  [int]$BackendPort = 3001,
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

function Get-LanIPv4 {
  try {
    $cfg = Get-NetIPConfiguration |
      Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } |
      Select-Object -First 1

    if ($cfg -and $cfg.IPv4Address -and $cfg.IPv4Address.IPAddress) {
      return $cfg.IPv4Address.IPAddress
    }
  } catch {
    # ignore
  }
  return $null
}

$lanIp = Get-LanIPv4

function Get-LanGatewayIPv4 {
  try {
    $cfg = Get-NetIPConfiguration |
      Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -ne $null } |
      Select-Object -First 1
    if ($cfg -and $cfg.IPv4DefaultGateway -and $cfg.IPv4DefaultGateway.NextHop) {
      return $cfg.IPv4DefaultGateway.NextHop
    }
  } catch {
    # ignore
  }
  return $null
}

$lanGw = Get-LanGatewayIPv4

Write-Host "Repo: $repoRoot"
$backendNote = if ($resolvedBackendPort -ne $BackendPort) { " (puerto $BackendPort ocupado)" } else { "" }
Write-Host "Backend: http://0.0.0.0:$resolvedBackendPort$backendNote"
Write-Host "Expo (Metro): port $ExpoPort (host=$ExpoHost)"
if ($lanIp) {
  $gwNote = if ($lanGw) { " (gateway $lanGw)" } else { "" }
  Write-Host "LAN IPv4: $lanIp$gwNote"
}
Write-Host "" 

if (Test-Path $mobileEnvPath) {
  $envContent = Get-Content -LiteralPath $mobileEnvPath -Raw
  if ($envContent -match '(?m)^EXPO_PUBLIC_API_BASE_URL=(?<url>.+)$') {
    $currentUrl = $Matches['url'].Trim()
    try {
      $uri = [Uri]$currentUrl
      $newHost = if ($lanIp) { $lanIp } else { $uri.Host }
      $newUrl = "{0}://{1}:{2}" -f $uri.Scheme, $newHost, $resolvedBackendPort
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
  "npm run start -- --clear --port $ExpoPort --host $ExpoHost"
) -join '; '

Start-PowerShellWindow -Title 'tesis-mobile (expo)' -Command $mobileCmd

Write-Host "Listo: se abrieron 2 ventanas (backend y Expo)."
Write-Host "Cierra esas ventanas para detenerlos." 

Write-Host ""
Write-Host "=== Verificación de red (rápida) ==="
if (-not $lanIp) {
  Write-Host "No pude detectar tu IP LAN. Si estás en una red nueva, revisa ipconfig y vuelve a ejecutar." -ForegroundColor Yellow
} else {
  Write-Host "Desde el iPhone (Safari) prueba:" 
  Write-Host "  - http://${lanIp}:${resolvedBackendPort}/health"
  Write-Host "Si eso NO abre, el iPhone no está en la misma red o hay 'AP/Client Isolation' en el Wi-Fi." -ForegroundColor Yellow
  if ($ExpoHost -eq 'lan') {
    Write-Host "Y para Expo Go, el QR debe apuntar a: exp://${lanIp}:${ExpoPort}"
    Write-Host "Si Expo Go da timeout en LAN, prueba: .\\run-dev.ps1 -ExpoHost tunnel" -ForegroundColor Yellow
  }

  try {
    Start-Sleep -Seconds 1
    $b = Test-NetConnection -ComputerName $lanIp -Port $resolvedBackendPort
    $m = Test-NetConnection -ComputerName $lanIp -Port $ExpoPort
    Write-Host "Chequeo local puertos (no garantiza iPhone, pero detecta si está escuchando):"
    Write-Host "  - Backend ${resolvedBackendPort}: $($b.TcpTestSucceeded)"
    Write-Host "  - Metro  ${ExpoPort}: $($m.TcpTestSucceeded)"
    if (-not $b.TcpTestSucceeded) {
      Write-Host "Nota: si es la primera vez, npm install puede tardar y el backend aún no escucha. Espera 20-60s y vuelve a probar /health." -ForegroundColor Yellow
    }
  } catch {
    # ignore
  }
}
