[CmdletBinding()]
param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port muss zwischen 1024 und 65535 liegen.' }
$sourceRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'node_modules/next'))) {
    throw 'Bitte zuerst im Projektordner npm.cmd ci ausfuehren.'
}
Push-Location $sourceRoot
try {
    Write-Host "Lokale Entwicklung: http://127.0.0.1:$Port/family"
    Write-Host 'Aenderungen werden direkt sichtbar. Der Pi wird hierbei nicht veraendert.'
    & npm.cmd run dev -- --hostname 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Entwicklungsserver wurde mit einem Fehler beendet.' }
} finally { Pop-Location }
