# install-to-project.ps1 - add (or remove) the UnityMCP v2 package to a Unity
# project as a UPM file: reference. Single-source install: no folder copying,
# updates to the package master apply to every project on next editor focus.
# Pure ASCII. Usage:
#   powershell -File install-to-project.ps1 -ProjectPath "<unity project folder>"
#   powershell -File install-to-project.ps1 -ProjectPath "..." -Remove
#   powershell -File install-to-project.ps1 -ProjectPath "..." -PackagePath "<package folder>"
# PackagePath defaults to the package/ folder next to this script's repo.

param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [string]$PackagePath,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$pkgName = "com.tunasync.unity-mcp"
if (-not $PackagePath) {
    $PackagePath = Join-Path (Split-Path -Parent $PSScriptRoot) "package\com.tunasync.unity-mcp"
}
if (-not (Test-Path -LiteralPath (Join-Path $PackagePath "package.json"))) {
    Write-Error "package not found at: $PackagePath (pass -PackagePath)"
}
$pkgSource = "file:" + ((Resolve-Path -LiteralPath $PackagePath).Path -replace '\\', '/')

$manifest = Join-Path $ProjectPath "Packages\manifest.json"
if (-not (Test-Path -LiteralPath $manifest)) {
    Write-Error "not a Unity project (no Packages\manifest.json): $ProjectPath"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $manifest -Destination "$manifest.bak-$stamp" -Force

$json = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if (-not $json.dependencies) { Write-Error "manifest.json has no dependencies block" }

$has = $null -ne $json.dependencies.PSObject.Properties[$pkgName]
if ($Remove) {
    if ($has) {
        $json.dependencies.PSObject.Properties.Remove($pkgName)
        $json | ConvertTo-Json -Depth 10 | Out-File -FilePath $manifest -Encoding utf8
        Write-Output "removed $pkgName from $ProjectPath"
    } else {
        Write-Output "not installed: $ProjectPath"
    }
} else {
    if ($has -and $json.dependencies.$pkgName -eq $pkgSource) {
        Write-Output "already installed: $ProjectPath"
    } else {
        $json.dependencies | Add-Member -NotePropertyName $pkgName -NotePropertyValue $pkgSource -Force
        $json | ConvertTo-Json -Depth 10 | Out-File -FilePath $manifest -Encoding utf8
        Write-Output "installed $pkgName -> $ProjectPath (backup: manifest.json.bak-$stamp)"
    }
}
