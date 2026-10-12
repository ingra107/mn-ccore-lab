# install.ps1 -- register the MN-CCORE member launcher for mnccore:// links,
# for this Windows user only. No administrator rights: it writes
# HKCU\Software\Classes\mnccore (never HKLM; UMN-managed laptops may lock HKLM).
#
#   Install.cmd                       what a person double-clicks
#   install.ps1                       install (refuses to replace another handler)
#   install.ps1 -Force                replace whatever handles mnccore:// now
#   install.ps1 -PrintCommand         print the command it would register, change nothing
#   install.ps1 -Scheme mnccore-selftest
#                                     register under a test scheme (the Hub repo's test
#                                     and Nick's laptops, where mnccore:// is taken)
#
# Copies mnccore-launcher.ps1 and uninstall.ps1 to %LOCALAPPDATA%\MNCCORE\Launcher,
# registers the launcher, and reads the registration back.
#
# Nick's laptops already run the Peripheral Brain launcher for mnccore://, which
# does more than this one. Without -Force this script refuses to replace any
# handler that is not this launcher, so running it there changes nothing.
#
# ASCII only: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

param(
    [ValidateSet('mnccore', 'mnccore-selftest')]
    [string]$Scheme = 'mnccore',
    [switch]$Force,
    [switch]$PrintCommand
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$LauncherName = 'mnccore-launcher.ps1'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MNCCORE\Launcher'
$Target = Join-Path $InstallDir $LauncherName
$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Command = '"' + $PowerShellExe + '" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Target + '" "%1"'

if ($PrintCommand) {
    [Console]::Out.WriteLine($Command)
    exit 0
}

$KeyPath = "Software\Classes\$Scheme"
$CommandPath = "$KeyPath\shell\open\command"
$SavedKeyPath = 'Software\MNCCORE\Launcher'
$hkcu = [Microsoft.Win32.Registry]::CurrentUser

function Read-Registered {
    $k = $hkcu.OpenSubKey($CommandPath)
    if ($null -eq $k) { return $null }
    try { return [string]$k.GetValue('') } finally { $k.Close() }
}

$existing = Read-Registered
$ours = $existing -and $existing.ToLowerInvariant().Contains(('\MNCCORE\Launcher\' + $LauncherName).ToLowerInvariant())
if ($existing -and -not $ours -and -not $Force) {
    Write-Host "Another program already opens ${Scheme}:// links for this Windows user:"
    Write-Host "  $existing"
    Write-Host ''
    Write-Host 'Nothing was changed. If this is one of Nick''s laptops, that is the Peripheral Brain'
    Write-Host 'launcher, which already does everything this one does. To replace it anyway, run'
    Write-Host '  install.ps1 -Force'
    exit 2
}

$source = Join-Path $PSScriptRoot $LauncherName
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    Write-Host "Cannot find $LauncherName next to this script ($PSScriptRoot). Unzip the whole download first."
    exit 1
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath $source -Destination $Target -Force
$uninstall = Join-Path $PSScriptRoot 'uninstall.ps1'
if (Test-Path -LiteralPath $uninstall -PathType Leaf) {
    Copy-Item -LiteralPath $uninstall -Destination (Join-Path $InstallDir 'uninstall.ps1') -Force
}
# A downloaded file carries a "came from the internet" mark; the copies should not.
Get-ChildItem -LiteralPath $InstallDir -File | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

# -Force over another handler: keep its command so uninstall.ps1 can put it back.
# Saved once; reinstalling over our own registration keeps the first saved value.
if ($existing -and -not $ours) {
    $saved = $hkcu.CreateSubKey($SavedKeyPath)
    $saved.SetValue("Previous-$Scheme", $existing)
    $saved.Close()
    Write-Host "Saved the previous ${Scheme}:// handler; uninstall.ps1 restores it:"
    Write-Host "  $existing"
}

$k = $hkcu.CreateSubKey($KeyPath)
$k.SetValue('', 'URL:MN-CCORE Launcher')
$k.SetValue('URL Protocol', '')
$k.Close()
$c = $hkcu.CreateSubKey($CommandPath)
$c.SetValue('', $Command)
$c.Close()

$back = Read-Registered
if ($back -ne $Command) {
    Write-Host "The registration did not read back. Expected:`n  $Command`nGot:`n  $back"
    exit 1
}
Write-Host "Installed the MN-CCORE launcher for ${Scheme}:// links."
Write-Host "  launcher : $Target"
Write-Host "  command  : $Command"
Write-Host ''
Write-Host 'Next: restart your browser. Then in the Hub open Settings > Integrations and turn on'
Write-Host '"I have the launcher installed on this computer".'
exit 0
