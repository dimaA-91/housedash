[CmdletBinding()]
param(
    # Defaults come from HOUSEDASH_PI_HOST and HOUSEDASH_PI_USER, so a personal Pi needs no arguments.
    [string]$PiHost = $(if ($env:HOUSEDASH_PI_HOST) { $env:HOUSEDASH_PI_HOST } else { 'housedash.local' }),
    [string]$PiUser = $(if ($env:HOUSEDASH_PI_USER) { $env:HOUSEDASH_PI_USER } else { 'pi' }),
    [string]$RemoteDirectory = '',
    [string]$BindAddress = '0.0.0.0',
    [string]$HostKeyAlias = '',
    [switch]$RestartOnly,
    # Images already on the Pi that must not be transferred again, e.g. -SkipImage housedash-voice:latest (slow Wi-Fi).
    [string[]]$SkipImage = @(),
    # Image lokal fuer ARM64 bauen (Docker Desktop) und auf den Pi uebertragen statt dort zu bauen.
    [switch]$LocalBuild,
    # Explicit fallback only. Normal deployments compile natively on the PC.
    [switch]$PiBuild
)
$ErrorActionPreference = 'Stop'
# Zeiten je Abschnitt, damit sichtbar bleibt, was ein Deployment wirklich dauert (Bauen, Übertragen, Pi).
$deployClock = [Diagnostics.Stopwatch]::StartNew()
$script:phaseStart = 0
function Write-Phase([string]$name) { $now = $deployClock.Elapsed.TotalSeconds; Write-Host ('[{0}] {1:N0} s' -f $name, ($now - $script:phaseStart)); $script:phaseStart = $now }
if ($LocalBuild -and $PiBuild) { throw 'LocalBuild und PiBuild nicht gemeinsam verwenden.' }
if ($HostKeyAlias -and $HostKeyAlias -notmatch '^[a-zA-Z0-9._-]+$') { throw 'Ungültiger SSH-Hostschlüsselname.' }
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')
if ($HostKeyAlias) { $sshOptions += @('-o', "HostKeyAlias=$HostKeyAlias") }
$sshOptionString = $sshOptions -join ' '
if (-not $RemoteDirectory) { $RemoteDirectory = "/home/$PiUser/housedash" }
# Keep remote arguments simple; do not interpolate arbitrary shell syntax.
if ($PiHost -notmatch '^[a-zA-Z0-9.-]+$' -or $PiUser -notmatch '^[a-z_][a-z0-9_-]*$' -or
    $RemoteDirectory -notmatch '^/home/[a-z0-9_-]+/[a-zA-Z0-9/_-]+$' -or
    $RemoteDirectory.Contains('..') -or $BindAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw 'Ungültige Verbindungsparameter. Ziel muss ein Unterordner unter /home/<benutzer>/ sein.'
}
$sourceRoot = Split-Path -Parent $PSScriptRoot
$destination = "${PiUser}@${PiHost}"
foreach ($required in @('ssh', 'scp', 'tar')) { Get-Command $required -ErrorAction Stop | Out-Null }
# Windows bsdtar: when started from Git Bash the GNU tar comes first on PATH and reads "C:" as a remote host.
$tarExe = Join-Path (Join-Path $env:SystemRoot 'System32') 'tar.exe'
if (-not (Test-Path $tarExe)) { $tarExe = 'tar' }
if ($RestartOnly) {
    & ssh @sshOptions $destination "cd $RemoteDirectory && HOUSEDASH_BIND_ADDRESS=$BindAddress bash scripts/deploy-pi.sh --restart-only"
    if ($LASTEXITCODE -ne 0) { throw 'Neustart auf dem Pi fehlgeschlagen.' }
    return
}
$deployArgs = ''
if (-not $PiBuild) {
    Get-Command docker -ErrorAction Stop | Out-Null
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop läuft nicht. Bitte starten und erneut versuchen.' }
    Write-Host 'Kompiliere nativ auf dem PC und verpacke ARM64-Abhaengigkeiten fuer den Pi.'
    Push-Location $sourceRoot
    try {
        $familyBuildClock = [Diagnostics.Stopwatch]::StartNew()
        & docker buildx build --platform linux/arm64 --load -t housedash-app:latest .
        if ($LASTEXITCODE -ne 0) { throw 'Lokaler Build fehlgeschlagen.' }
        & docker buildx build --platform linux/arm64 --load -t housedash-voice:latest ./voice
        if ($LASTEXITCODE -ne 0) { throw 'Build des Sprachdienstes fehlgeschlagen.' }
        & docker buildx build --platform linux/arm64 --load -t housedash-https:latest ./https
        if ($LASTEXITCODE -ne 0) { throw 'Build des lokalen HTTPS-Dienstes fehlgeschlagen.' }
        $familyBuildClock.Stop()
        Write-Host ('Image gebaut in {0:N1} Sekunden.' -f $familyBuildClock.Elapsed.TotalSeconds)
        Write-Phase 'Bauen'
        $imageArchitecture = & docker image inspect --format '{{.Architecture}}' housedash-app:latest
        if ($LASTEXITCODE -ne 0 -or $imageArchitecture.Trim() -ne 'arm64') { throw 'Das Image ist nicht fuer ARM64 gebaut.' }
    } finally { Pop-Location }
    $imagesToTransfer = @()
    foreach ($imageName in @('housedash-app:latest', 'housedash-voice:latest', 'housedash-https:latest')) {
        # Provenance can change the manifest ID while runtime content stays identical.
        $localImageId = & docker image inspect --format '{{json .RootFS.Layers}}__{{json .Config}}' $imageName
        if ($LASTEXITCODE -ne 0) { throw "Lokales Image fehlt: $imageName" }
        $remoteImageId = & ssh @sshOptions $destination "docker image inspect --format='{{json .RootFS.Layers}}__{{json .Config}}' $imageName 2>/dev/null"
        if ($LASTEXITCODE -notin @(0, 1)) { throw 'Image-Vergleich auf dem Pi fehlgeschlagen.' }
        if ($SkipImage -contains $imageName -and $remoteImageId) { Write-Host "Übersprungen (bleibt wie auf dem Pi): $imageName" }
        elseif (($remoteImageId -join '').Trim() -ne ($localImageId -join '').Trim()) { $imagesToTransfer += $imageName }
        else { Write-Host "Bereits auf dem Pi vorhanden: $imageName" }
    }
    if ($imagesToTransfer.Count -gt 0) {
        Write-Host 'Übertrage nur geänderte Images auf den Pi.'
        $imageArguments = $imagesToTransfer -join ' '
        & cmd /c "docker save $imageArguments | ssh -C $sshOptionString $destination docker load"
        if ($LASTEXITCODE -ne 0) { throw 'Image konnte nicht auf den Pi geladen werden.' }
        Write-Phase 'Image uebertragen'
    }
    $deployArgs = ' --prebuilt'
}
$archive = Join-Path ([IO.Path]::GetTempPath()) ("housedash-" + [guid]::NewGuid().ToString('N') + '.tar.gz')
$remoteArchive = '/home/' + $PiUser + '/' + [IO.Path]::GetFileName($archive)
try {
    Write-Host 'Packe den aktuellen Quellcode ohne lokale Daten und Zugangsdaten.'
    & node (Join-Path $sourceRoot 'scripts/sync-housedash-source.mjs') --manifest
    if ($LASTEXITCODE -ne 0) { throw 'Quellcode-Manifest konnte nicht erzeugt werden.' }
    & $tarExe -czf $archive --exclude=./.git --exclude=./node_modules --exclude=./.next --exclude=.env --exclude='.env.*' --exclude=./data --exclude=./backups --exclude=./.deploy --exclude=./.deploy.lock --exclude=*.tar.gz --exclude=*.tsbuildinfo --exclude=./.idea --exclude=./.vscode --exclude=./coverage --exclude=./test-results --exclude=./playwright-report -C $sourceRoot .
    if ($LASTEXITCODE -ne 0) { throw 'Quellcode konnte nicht gepackt werden.' }
    & scp @sshOptions $archive "${destination}:$remoteArchive"
    if ($LASTEXITCODE -ne 0) { throw 'Upload fehlgeschlagen.' }
    # Extract only source files; live data resides in Docker volumes. Existing .env is preserved.
    & ssh @sshOptions $destination "mkdir -p $RemoteDirectory && tar -xzf $remoteArchive -C $RemoteDirectory && cd $RemoteDirectory && node scripts/sync-housedash-source.mjs --prune && HOUSEDASH_BIND_ADDRESS=$BindAddress bash scripts/deploy-pi.sh$deployArgs"
    if ($LASTEXITCODE -ne 0) { throw "Deployment fehlgeschlagen. Upload für Diagnose erhalten: $remoteArchive" }
    Write-Phase 'Quellcode hochladen und auf dem Pi ausrollen'
    & ssh @sshOptions $destination "rm -- $remoteArchive"
    if ($LASTEXITCODE -ne 0) { Write-Warning "Upload konnte nicht entfernt werden: $remoteArchive" }
} finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
