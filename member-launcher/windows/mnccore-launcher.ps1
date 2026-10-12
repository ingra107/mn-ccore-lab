# mnccore-launcher.ps1 -- the MN-CCORE member launcher for Windows.
#
# Handles two kinds of Hub link and nothing else:
#   mnccore://open/<folder>     open the folder in File Explorer
#   mnccore://workon/<folder>   open a terminal in the folder running `claude`
#
# Registered for this Windows user only (HKCU\Software\Classes\mnccore) by
# install.ps1 as:
#   "<powershell.exe>" -NoProfile -NonInteractive -ExecutionPolicy Bypass
#       -WindowStyle Hidden -File "<this file>" "%1"
# Windows hands that command line to powershell.exe directly: no cmd.exe reads
# the link. With -File, every argument after the script path reaches this
# script as plain text; PowerShell never evaluates it.
#
# Rules for <folder>, checked in this order (any failure = a message, nothing
# opened):
#   1. Exactly one argument. A raw double quote in a link splits it into
#      several, so a quote is refused before anything else looks at it. A
#      double quote or a control character, raw or %-encoded, is refused.
#   2. Only the open and workon verbs. Every other mnccore:// verb belongs to
#      the Peripheral Brain launcher on Nick's laptops and is refused here.
#   3. The path is %-decoded once, / becomes \, and it must be a drive path
#      (C:\...). Network shares (\\host\share) are refused as TEXT, before any
#      file-system call: looking at a \\host path sends that host your Windows
#      sign-in hash. A mapped network drive is refused too.
#   4. After resolving . and .., the folder must be inside your user folder
#      (%USERPROFILE%; Box Drive and OneDrive live there), and must exist.
# The folder text never reaches a command line: Explorer gets it as one quoted
# argument (a Windows path cannot contain a quote), and the terminal gets it as
# its working directory, never as text cmd.exe parses.
#
# MNCCORE_LAUNCHER_DRYRUN=1 prints the planned action instead of running it;
# every check still runs. Log: %TEMP%\mnccore-launcher.log.
#
# ASCII only: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$LauncherSchemes = @('mnccore', 'mnccore-selftest')
$LauncherDryRun = [bool]$env:MNCCORE_LAUNCHER_DRYRUN
$LauncherLog = Join-Path ([System.IO.Path]::GetTempPath()) 'mnccore-launcher.log'
$LauncherTitle = 'MN-CCORE Launcher'
$Refused = 'REFUSED: '

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
        # total fallback: the exit code and the message box still report
    }
}

function Show-LauncherMessage([string]$Text) {
    $safe = ConvertTo-LauncherSafe $Text
    if ($LauncherDryRun) { [Console]::Out.WriteLine($safe); return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $owner = New-Object System.Windows.Forms.Form
        $owner.TopMost = $true
        [void][System.Windows.Forms.MessageBox]::Show($owner, $safe, $LauncherTitle,
            [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        $owner.Dispose()
    } catch {
        Write-LauncherLog ('message box failed: ' + $_.Exception.Message)
    }
}

function Test-LauncherControl([string]$Text) {
    return [regex]::IsMatch($Text, '[\x00-\x1f\x7f]')
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
    $cmp = [System.StringComparison]::OrdinalIgnoreCase
    if (-not ($full.Equals($homeDir, $cmp) -or $full.StartsWith($homeDir + '\', $cmp))) {
        throw ($Refused + "only folders inside your user folder ($homeDir) open from a link: $full")
    }
    if (-not [System.IO.Directory]::Exists($full)) {
        throw ($Refused + "folder not found: $full. Check the path under My folder on the project page.")
    }
    return @{ Verb = $verb; Path = $full }
}

# Re-read PATH from the registry: a browser started before Claude Code was
# installed still carries the old PATH, and the terminal inherits ours.
function Find-Claude {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
    $cmd = Get-Command -Name 'claude' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

function Invoke-LauncherRequest($Request) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($Request.Verb -eq 'open') {
        $psi.FileName = Join-Path $env:SystemRoot 'explorer.exe'
        $psi.Arguments = '"' + $Request.Path + '"'
        $psi.UseShellExecute = $false
        $plan = [ordered]@{ verb = 'open'; file = $psi.FileName; arguments = $psi.Arguments }
    } else {
        $claude = Find-Claude
        if (-not $claude -and -not $LauncherDryRun) {
            throw ($Refused + 'Claude Code was not found on this computer. Install it (https://docs.claude.com/en/docs/claude-code/setup), then try again.')
        }
        $psi.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
        $psi.Arguments = '/k claude'
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
            Write-LauncherLog ('FAIL: ' + (ConvertTo-LauncherSafe $msg))
            Show-LauncherMessage ('The link was not opened: ' + $msg.Substring($Refused.Length))
            return 1
        }
        Write-LauncherLog ('CRASH: ' + (ConvertTo-LauncherSafe ($_ | Out-String)))
        Show-LauncherMessage ("The launcher hit an unexpected error. Details are in $LauncherLog")
        return 2
    }
}

# Dot-sourcing (`. .\mnccore-launcher.ps1`) loads the functions without running.
if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-LauncherMain $args)
}
