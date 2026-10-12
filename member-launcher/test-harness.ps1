# test-harness.ps1 -- run the REAL Windows member launcher with its two
# machine-specific answers supplied: the workon dialog and where Claude Code is.
#
#   powershell -File test-harness.ps1 -Launcher <mnccore-launcher.ps1> -Answer yes|no -Claude <path> "<link>"
#
# Test-only (member-launcher.test.mjs). It is not in the download zips and is
# never registered for mnccore://. It dot-sources the shipped launcher (which
# then defines its functions without running), replaces Confirm-LauncherWorkOn
# (so no dialog ever appears on the desktop running the tests) and
# Resolve-LauncherClaudePath (so a stub stands in for Claude Code), and calls the
# launcher's own Invoke-LauncherMain with the link. Every check, the refusal path,
# Find-LauncherClaude's validation and Process.Start are the shipped code.
#
# ASCII only: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

# Plain parameters, no [Parameter()] attributes: those would make this an
# advanced script, which refuses the link as an extra positional argument instead
# of leaving it in $args.
param([string]$Launcher, [string]$Answer, [string]$Claude)
if (-not $Launcher -or -not $Claude -or @('yes', 'no') -notcontains $Answer) {
    [Console]::Out.WriteLine('usage: test-harness.ps1 -Launcher <ps1> -Answer yes|no -Claude <path> <link>')
    exit 64
}

. $Launcher

$script:HarnessAnswer = ($Answer -eq 'yes')
$script:HarnessClaude = $Claude

function Confirm-LauncherWorkOn([string]$Folder) {
    [Console]::Out.WriteLine('ASKED ' + $Folder + ' -> ' + $(if ($script:HarnessAnswer) { 'yes' } else { 'no' }))
    return $script:HarnessAnswer
}

function Resolve-LauncherClaudePath {
    return $script:HarnessClaude
}

exit (Invoke-LauncherMain $args)
