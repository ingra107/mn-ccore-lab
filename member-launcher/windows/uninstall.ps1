# uninstall.ps1 -- remove the MN-CCORE member launcher for this Windows user.
#
#   Uninstall.cmd                       what a person double-clicks
#   uninstall.ps1                       remove the mnccore:// registration and the files
#   uninstall.ps1 -Scheme mnccore-selftest
#
# Touches HKCU\Software\Classes\<scheme> ONLY when it points at this launcher:
# it never removes another program's handler (on Nick's laptops, the Peripheral
# Brain launcher). If install.ps1 -Force replaced a handler, the saved command
# (HKCU\Software\MNCCORE\Launcher, Previous-<scheme>) is put back instead of
# deleting the key. The files in %LOCALAPPDATA%\MNCCORE\Launcher are removed
# once no scheme points at them any more.
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
$SavedKeyPath = 'Software\MNCCORE\Launcher'
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
    # install.ps1 -Force saved the handler it replaced: put it back.
    $savedKey = $hkcu.OpenSubKey($SavedKeyPath, $true)
    $previous = if ($savedKey) { [string]$savedKey.GetValue("Previous-$Scheme") } else { '' }
    if ($previous) {
        $c = $hkcu.CreateSubKey("Software\Classes\$Scheme\shell\open\command")
        $c.SetValue('', $previous)
        $c.Close()
        $savedKey.DeleteValue("Previous-$Scheme")
        if ((Read-Registered $Scheme) -ne $previous) {
            Write-Host "Could not restore the previous ${Scheme}:// handler. Set it back by hand to:`n  $previous"
            $status = 1
        } else {
            Write-Host "Restored the ${Scheme}:// handler this launcher replaced:"
            Write-Host "  $previous"
        }
    } else {
        $hkcu.DeleteSubKeyTree("Software\Classes\$Scheme")
        Write-Host "Removed the ${Scheme}:// registration."
    }
    if ($savedKey) { $savedKey.Close() }
}
# Drop HKCU\Software\MNCCORE once nothing is saved under it.
$sk = $hkcu.OpenSubKey($SavedKeyPath)
if ($sk) {
    $empty = ($sk.ValueCount -eq 0 -and $sk.SubKeyCount -eq 0)
    $sk.Close()
    if ($empty) { $hkcu.DeleteSubKeyTree('Software\MNCCORE') }
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
