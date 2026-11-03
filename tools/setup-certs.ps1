#Requires -Version 5.1
<#
.SYNOPSIS
  Genera certificados TLS locales con mkcert para el servidor VIO y el celular.

.DESCRIPTION
  - Instala/actualiza la CA de mkcert.
  - Genera certs/dev-cert.pem y certs/dev-key.pem para localhost y las IPs LAN.
  - Copia la CA a certs/rootCA.pem para instalarla en Android.
  - Si la consola está elevada, abre los puertos 5173, 8443 y 8765 en el firewall.

  Ejecutar desde una consola elevada:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/setup-certs.ps1
#>
[CmdletBinding()]
param(
  [string[]] $ExtraHosts = @(),
  [switch] $SkipFirewall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root 'certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

function Write-Step {
  param([string] $Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-LanIPv4 {
  $addresses = @()
  try {
    $addresses = @(
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
          $_.IPAddress -notlike '127.*' -and
          $_.IPAddress -notlike '169.254.*' -and
          $_.AddressState -ne 'Tentative'
        } |
        Select-Object -ExpandProperty IPAddress -Unique
    )
  } catch {
    Write-Warning "No se pudieron leer las IPs con Get-NetIPAddress: $($_.Exception.Message)"
  }
  return $addresses
}

$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
  Write-Host ''
  Write-Host 'mkcert no está instalado.' -ForegroundColor Yellow
  Write-Host 'Instalalo con:'
  Write-Host '  winget install --id FiloSottile.mkcert --scope user'
  Write-Host 'Después cerrá y volvé a abrir la terminal, y ejecutá este script de nuevo.'
  exit 1
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
  Write-Warning (
    'La consola no está elevada. mkcert -install y las reglas de firewall pueden fallar. ' +
    'Si falla, abrí PowerShell como administrador y repetí el comando.'
  )
}

Write-Step "Instalando la CA local de mkcert"
& mkcert -install
if ($LASTEXITCODE -ne 0) {
  throw 'mkcert -install falló. Probá desde una consola elevada.'
}

$lanIps = @(Get-LanIPv4)
$hosts = @('localhost', '127.0.0.1', '::1') + $lanIps + $ExtraHosts
$hosts = @($hosts | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Select-Object -Unique)

$certPath = Join-Path $certDir 'dev-cert.pem'
$keyPath = Join-Path $certDir 'dev-key.pem'

Write-Step "Generando certificado para: $($hosts -join ', ')"
& mkcert -cert-file $certPath -key-file $keyPath $hosts
if ($LASTEXITCODE -ne 0) {
  throw 'mkcert no pudo generar el certificado.'
}

Write-Step 'Exportando la CA raíz para Android'
$caRoot = (& mkcert -CAROOT).Trim()
$sourceCa = Join-Path $caRoot 'rootCA.pem'
if (-not (Test-Path $sourceCa)) {
  throw "No se encontró la CA de mkcert en $sourceCa"
}
$targetCa = Join-Path $certDir 'rootCA.pem'
Copy-Item -Force $sourceCa $targetCa
Write-Host "CA copiada a: $targetCa"

if (-not $SkipFirewall) {
  Write-Step 'Configurando reglas de firewall (perfil privado)'
  $ports = @(5173, 8443, 8765)
  if ($isAdmin) {
    foreach ($port in $ports) {
      $displayName = "VIO marker fusion TCP $port"
      $existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
      if ($existing) {
        Write-Host "Regla ya existente: $displayName"
      } else {
        New-NetFirewallRule `
          -DisplayName $displayName `
          -Direction Inbound `
          -Protocol TCP `
          -LocalPort $port `
          -Action Allow `
          -Profile Private | Out-Null
        Write-Host "Regla creada: $displayName"
      }
    }
  } else {
    Write-Host 'Consola no elevada: no se crearon reglas.' -ForegroundColor Yellow
    Write-Host 'Ejecutá este bloque en PowerShell como administrador:'
    foreach ($port in $ports) {
      Write-Host "  New-NetFirewallRule -DisplayName 'VIO marker fusion TCP $port' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private"
    }
  }
}

$primaryIp = $lanIps | Select-Object -First 1
if (-not $primaryIp) {
  $primaryIp = 'IP_DE_LA_PC'
}

Write-Step 'Listo'
Write-Host "Certificado: $certPath"
Write-Host "Clave:       $keyPath"
Write-Host "CA para el celular: $targetCa"
Write-Host ''
Write-Host 'En Chrome para Android:' -ForegroundColor Green
Write-Host '  1. Copiá certs/rootCA.pem al celular (USB, Drive, etc.).'
Write-Host '  2. Ajustes > Seguridad > Cifrado y credenciales > Instalar un certificado.'
Write-Host '  3. Elegí "Certificado de CA" y seleccioná rootCA.pem.'
Write-Host '  4. Abrí https://<IP>:5173/ y verificá que no haya advertencias.'
Write-Host ''
Write-Host "IP sugerida: https://${primaryIp}:5173/"
Write-Host 'Si la red WiFi aísla clientes, usá un hotspot propio o adb reverse.'
