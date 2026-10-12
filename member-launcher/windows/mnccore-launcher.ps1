# mnccore-launcher.ps1 -- the MN-CCORE member launcher for Windows.
#
# Handles two kinds of Hub link and nothing else:
#   mnccore://open/<folder>     open the folder in File Explorer
#   mnccore://workon/<folder>   ask first, then open a terminal in the folder
#                               running Claude Code
#
# Registered for this Windows user only (HKCU\Software\Classes\mnccore) by
# install.ps1 as:
#   "<powershell.exe>" -NoProfile -NonInteractive -ExecutionPolicy Bypass
#       -WindowStyle Hidden -File "<this file>" "%1"
# Windows hands that command line to powershell.exe directly: no cmd.exe reads
# the link. With -File, every argument after the script path reaches this
# script as plain text; PowerShell never evaluates it.
#
# Rules for <folder>, checked in this order (any failure = a short fixed
# message, the reason in the log, nothing opened):
#   1. Exactly one argument. A raw double quote in a link splits it into
#      several, so a quote is refused before anything else looks at it. A
#      double quote or a control character, raw or %-encoded, is refused.
#   2. Only the open and workon verbs. Every other mnccore:// verb belongs to
#      the Peripheral Brain launcher on Nick's laptops and is refused here.
#   3. The path is %-decoded exactly once (the Hub encodes each segment once),
#      / becomes \, and it must be a drive path (C:\...). Network shares
#      (\\host\share) are refused as TEXT, before any file-system call: looking
#      at a \\host path sends that host your Windows sign-in hash. A mapped
#      network drive is refused too.
#   4. After resolving . and .., the folder must be inside your user folder
#      (%USERPROFILE%; Box Drive and OneDrive live there), and must exist.
#
# Any web page can fire a mnccore:// link, so:
#   - open only shows a folder in Explorer: the folder reaches Explorer as one
#     quoted argument (a Windows path cannot contain a quote).
#   - workon asks first, in a dialog that names the folder, defaulting to No
#     (the folder may hold someone else's CLAUDE.md or .claude settings).
#   - workon starts Claude Code by its ABSOLUTE path, found on the PATH stored
#     in the registry, never by the bare name `claude`, and sets
#     NoDefaultCurrentDirectoryInExePath=1 for cmd.exe and everything it starts.
#     Without both, a claude.cmd / claude.exe / node.exe sitting in a synced
#     project folder would run instead (cmd.exe searches the current folder
#     first). A claude found inside the target folder is refused.
#
# Environment (none of these can come from a link):
#   MNCCORE_LAUNCHER_DRYRUN=1        print the planned action, run nothing; every
#                                    check still runs, no dialog is shown
#   MNCCORE_LAUNCHER_TEST_CONFIRM    yes|no: answer the workon dialog without
#                                    showing it (member-launcher.test.mjs)
#   MNCCORE_LAUNCHER_TEST_CLAUDE     absolute path used instead of the PATH
#                                    lookup (the test's stub; still must be an
#                                    existing file outside the target folder)
# Log: %TEMP%\mnccore-launcher.log.
#
# ASCII only: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$LauncherSchemes = @('mnccore', 'mnccore-selftest')
$LauncherDryRun = [bool]$env:MNCCORE_LAUNCHER_DRYRUN
$LauncherLog = Join-Path ([System.IO.Path]::GetTempPath()) 'mnccore-launcher.log'
$LauncherTitle = 'MN-CCORE Launcher'
$Refused = 'REFUSED: '
$Declined = 'DECLINED'
# The dialog types are named in argument lists below, so load them up front.
try { Add-Type -AssemblyName System.Windows.Forms } catch { }

function ConvertTo-LauncherSafe([string]$Text) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Text.ToCharArray()) {
        $n = [int]$ch
        if ($n -lt 32 -or $n -eq 127) { [void]$sb.Append(('\x{0:x2}' -f $n)) } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function Write-LauncherLog([string]$Message) {
    try {
        $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Message
        Add-Content -LiteralPath $LauncherLog -Value $line -Encoding UTF8
    } catch {
        # total fallback: the exit code and the dialog still report
    }
}

function Show-LauncherBox([string]$Text, $Buttons, $Icon, $DefaultButton) {
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    try {
        return [System.Windows.Forms.MessageBox]::Show($owner, $Text, $LauncherTitle, $Buttons, $Icon, $DefaultButton)
    } finally {
        $owner.Dispose()
    }
}

# A refusal: the person sees a fixed sentence; the reason goes to the log (and
# to stdout under dry-run, for the tests). Link text never reaches the dialog.
function Show-LauncherRefusal([string]$Detail) {
    $safe = ConvertTo-LauncherSafe $Detail
    Write-LauncherLog ('FAIL: ' + $safe)
    if ($LauncherDryRun) { [Console]::Out.WriteLine('The link was not opened: ' + $safe); return }
    try {
        [void](Show-LauncherBox ("The MN-CCORE Launcher did not open this link. The reason is in $LauncherLog") `
            ([System.Windows.Forms.MessageBoxButtons]::OK) ([System.Windows.Forms.MessageBoxIcon]::Warning) `
            ([System.Windows.Forms.MessageBoxDefaultButton]::Button1))
    } catch {
        Write-LauncherLog ('message box failed: ' + $_.Exception.Message)
    }
}

# The workon confirmation. True only on an explicit Yes.
function Confirm-LauncherWorkOn([string]$Folder) {
    $answer = [string]$env:MNCCORE_LAUNCHER_TEST_CONFIRM
    if ($answer) { return ($answer -eq 'yes') }
    $text = "Start Claude Code in this folder?`r`n`r`n$Folder`r`n`r`n" +
        'Continue only if you just clicked "Work on this in Claude" in the MN-CCORE Hub. ' +
        'Claude Code will read the files in this folder, including any CLAUDE.md or .claude settings in it.'
    $r = Show-LauncherBox $text ([System.Windows.Forms.MessageBoxButtons]::YesNo) `
        ([System.Windows.Forms.MessageBoxIcon]::Question) ([System.Windows.Forms.MessageBoxDefaultButton]::Button2)
    return ($r -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Test-LauncherControl([string]$Text) {
    return [regex]::IsMatch($Text, '[\x00-\x1f\x7f]')
}

function Test-LauncherUnder([string]$Child, [string]$Root) {
    $cmp = [System.StringComparison]::OrdinalIgnoreCase
    return ($Child.Equals($Root, $cmp) -or $Child.StartsWith($Root + '\', $cmp))
}

# Returns @{ Verb; Path } or throws 'REFUSED: <why>'.
function Resolve-LauncherRequest([object[]]$Arguments) {
    if ($null -eq $Arguments -or $Arguments.Count -ne 1) {
        $n = if ($null -eq $Arguments) { 0 } else { $Arguments.Count }
        throw ($Refused + "expected one mnccore:// link, got $n arguments. A link with a double quote in it is not accepted.")
    }
    $url = [string]$Arguments[0]
    if ($url.Contains('"')) { throw ($Refused + 'a link may not contain a double quote.') }
    if (Test-LauncherControl $url) { throw ($Refused + 'a link may not contain a control character.') }

    $m = [regex]::Match($url, '^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*)://(?<verb>[A-Za-z]+)/(?<rest>.+)$')
    if (-not $m.Success) { throw ($Refused + "this is not a folder link: $url") }
    $scheme = $m.Groups['scheme'].Value.ToLowerInvariant()
    if ($LauncherSchemes -notcontains $scheme) { throw ($Refused + "this launcher does not handle ${scheme}:// links.") }
    $verb = $m.Groups['verb'].Value.ToLowerInvariant()
    if ($verb -ne 'open' -and $verb -ne 'workon') {
        throw ($Refused + "this launcher only opens folders; it does not handle '$verb' links.")
    }

    # Exactly one decode: the Hub encodes each path segment once.
    $path = [System.Uri]::UnescapeDataString($m.Groups['rest'].Value)
    if ($path.Contains('"')) { throw ($Refused + 'a folder path may not contain a double quote.') }
    if (Test-LauncherControl $path) { throw ($Refused + 'a folder path may not contain a control character.') }
    $path = $path.Replace('/', '\')

    # Text checks first: nothing below may touch a network host.
    if ($path -notmatch '^[A-Za-z]:\\') {
        throw ($Refused + "only a folder on this computer's own drives can be opened from a link (network shares are refused): $path")
    }
    if ($path.IndexOf(':', 2) -ge 0) { throw ($Refused + "not a plain folder path: $path") }
    $drive = New-Object System.IO.DriveInfo ($path.Substring(0, 1))
    if ($drive.DriveType -eq [System.IO.DriveType]::Network) {
        throw ($Refused + "$($path.Substring(0, 2)) is a network drive: $path")
    }

    $full = [System.IO.Path]::GetFullPath($path).TrimEnd('\')
    $homeDir = [string]$env:USERPROFILE
    if (-not $homeDir) { throw ($Refused + 'USERPROFILE is not set, so the launcher cannot tell where your user folder is.') }
    $homeDir = [System.IO.Path]::GetFullPath($homeDir).TrimEnd('\')
    if (-not (Test-LauncherUnder $full $homeDir)) {
        throw ($Refused + "only folders inside your user folder ($homeDir) open from a link: $full")
    }
    if (-not [System.IO.Directory]::Exists($full)) {
        throw ($Refused + "folder not found: $full. Check the path under My folder on the project page.")
    }
    return @{ Verb = $verb; Path = $full }
}

# The absolute path of Claude Code, from the PATH stored in the registry (a
# browser started before Claude Code was installed still carries the old PATH).
# Never the bare name: that is what lets a planted claude.cmd run.
function Find-LauncherClaude([string]$Folder) {
    $claude = [string]$env:MNCCORE_LAUNCHER_TEST_CLAUDE
    if (-not $claude) {
        $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $user = [Environment]::GetEnvironmentVariable('Path', 'User')
        $dirs = @(@($machine, $user) -join ';' -split ';' | Where-Object { $_ -and [System.IO.Path]::IsPathRooted($_) })
        $env:Path = $dirs -join ';'
        $cmd = Get-Command -Name 'claude' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd) { $claude = [string]$cmd.Source }
    }
    if (-not $claude) {
        throw ($Refused + 'Claude Code was not found on this computer. Install it (https://docs.claude.com/en/docs/claude-code/setup), then try again.')
    }
    if (-not [System.IO.Path]::IsPathRooted($claude) -or -not [System.IO.File]::Exists($claude) -or $claude.Contains('"')) {
        throw ($Refused + "Claude Code resolved to a path that is not a plain file: $claude")
    }
    $claude = [System.IO.Path]::GetFullPath($claude)
    if (Test-LauncherUnder $claude $Folder) {
        throw ($Refused + "the claude found on PATH is inside the folder being opened, so it was not run: $claude")
    }
    return $claude
}

function Invoke-LauncherRequest($Request) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($Request.Verb -eq 'open') {
        $psi.FileName = Join-Path $env:SystemRoot 'explorer.exe'
        $psi.Arguments = '"' + $Request.Path + '"'
        $psi.UseShellExecute = $false
        $plan = [ordered]@{ verb = 'open'; file = $psi.FileName; arguments = $psi.Arguments }
    } else {
        $claude = Find-LauncherClaude $Request.Path
        # cmd.exe /d (no AutoRun) /k "<absolute claude>". cmd strips the outer
        # pair of quotes, leaving the quoted path as the command.
        $psi.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
        $psi.Arguments = '/d /k ""' + $claude + '""'
        $psi.WorkingDirectory = $Request.Path
        $psi.UseShellExecute = $true
        $plan = [ordered]@{ verb = 'workon'; file = $psi.FileName; arguments = $psi.Arguments; cwd = $psi.WorkingDirectory; claude = $claude }
    }
    $json = ConvertTo-Json -InputObject $plan -Compress
    if ($LauncherDryRun) {
        [Console]::Out.WriteLine('DRYRUN ' + $json)
        Write-LauncherLog ('DRYRUN ' + $json)
        return 0
    }
    if ($Request.Verb -eq 'workon' -and -not (Confirm-LauncherWorkOn $Request.Path)) {
        Write-LauncherLog ('DECLINED ' + $json)
        [Console]::Out.WriteLine($Declined)
        return 3
    }
    # Inherited by cmd.exe and every child (the npm claude.cmd shim looks up
    # node): no bare command name may resolve to the current (project) folder.
    $env:NoDefaultCurrentDirectoryInExePath = '1'
    Write-LauncherLog ('RUN ' + $json)
    [void][System.Diagnostics.Process]::Start($psi)
    return 0
}

function Invoke-LauncherMain([object[]]$Arguments) {
    $shown = @($Arguments | ForEach-Object { ConvertTo-LauncherSafe ([string]$_) }) -join ' | '
    Write-LauncherLog ('ARGS: ' + $shown)
    try {
        $request = Resolve-LauncherRequest $Arguments
        return (Invoke-LauncherRequest $request)
    } catch {
        $msg = [string]$_.Exception.Message
        if ($msg.StartsWith($Refused)) {
            Show-LauncherRefusal $msg.Substring($Refused.Length)
            return 1
        }
        Show-LauncherRefusal ('unexpected error: ' + ($_ | Out-String))
        return 2
    }
}

# Dot-sourcing (`. .\mnccore-launcher.ps1`) loads the functions without running.
if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-LauncherMain $args)
}
