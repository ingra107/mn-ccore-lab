# uninstall.ps1 -- remove the MN-CCORE member launcher for this Windows user.
#
#   Uninstall.cmd                       what a person double-clicks
#   uninstall.ps1                       remove the mnccore:// registration and the files
#   uninstall.ps1 -Scheme mnccore-selftest
#
# Removes HKCU\Software\Classes\<scheme> ONLY when it points at this launcher:
# it never removes another program's handler (on Nick's laptops, the Peripheral
# Brain launcher). The files in %LOCALAPPDATA%\MNCCORE\Launcher are removed once
# no scheme points at them any more.
#
# ASCII only: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

param(
    [ValidateSet('mnccore', 'mnccore-selftest')]
    [string]$Scheme = 'mnccore'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$LauncherName = 'mnccore-launcher.ps1'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MNCCORE\Launcher'
$Marker = ('\MNCCORE\Launcher\' + $LauncherName).ToLowerInvariant()
$hkcu = [Microsoft.Win32.Registry]::CurrentUser

function Read-Registered([string]$S) {
    $k = $hkcu.OpenSubKey("Software\Classes\$S\shell\open\command")
    if ($null -eq $k) { return $null }
    try { return [string]$k.GetValue('') } finally { $k.Close() }
}

$existing = Read-Registered $Scheme
$status = 0
if ($null -eq $existing) {
    Write-Host "Nothing handles ${Scheme}:// links for this Windows user; no registration to remove."
} elseif (-not $existing.ToLowerInvariant().Contains($Marker)) {
    Write-Host "${Scheme}:// links are handled by another program, not this launcher:"
    Write-Host "  $existing"
    Write-Host 'Left it as it is.'
    $status = 2
} else {
    $hkcu.DeleteSubKeyTree("Software\Classes\$Scheme")
    Write-Host "Removed the ${Scheme}:// registration."
}

$stillUsed = @('mnccore', 'mnccore-selftest') | Where-Object {
    $v = Read-Registered $_
    $v -and $v.ToLowerInvariant().Contains($Marker)
}
if (-not $stillUsed -and (Test-Path -LiteralPath $InstallDir)) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $InstallDir) {
        Write-Host "Could not remove $InstallDir; delete it by hand."
    } else {
        Write-Host "Removed $InstallDir."
        $parent = Split-Path -Parent $InstallDir
        if ((Test-Path -LiteralPath $parent) -and -not (Get-ChildItem -LiteralPath $parent -Force)) {
            Remove-Item -LiteralPath $parent -Force -ErrorAction SilentlyContinue
        }
    }
}
Write-Host 'In the Hub, turn off Settings > Integrations > "I have the launcher installed on this computer".'
exit $status
