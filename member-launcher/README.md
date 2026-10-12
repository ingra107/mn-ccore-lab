# MN-CCORE Launcher

**New (October 2026).** The Mac version has not been tried on a Mac yet. If anything does
not work, or looks odd, tell Nick what you saw (a screenshot of the window is perfect).

The launcher lets the Hub open a project folder on your computer and start Claude Code in it.
On a project page, under **My folder**, you save the path to your own copy of that project.
With the launcher installed, two buttons appear next to it:

- **Open folder** shows the folder in Finder (Mac) or File Explorer (Windows).
- **Work on this in Claude** asks you to confirm, then opens a terminal in the folder and
  starts Claude Code.

Without the launcher you still get **Copy path**.

It is small and does only this. It opens a folder only if it exists on this computer, inside
your own home folder. It refuses network shares, apps and every other kind of link.

## Before you start

- Claude Code installed, if you want the Work on button: https://docs.claude.com/en/docs/claude-code/setup
- Your project folders on this computer (Box Drive is fine).

## Mac

1. Unzip the download (double-click it).
2. Open **Terminal** (Applications > Utilities). Type `bash ` with a space after it, drag
   **install.sh** from the unzipped folder into the Terminal window, and press Return.
   It builds **MNCCORE Launcher** in your own Applications folder. No password needed.
   To see what it would do first, type `bash `, drag install.sh in, then type ` --dry-run`.
3. Restart your browser.
4. In the Hub, open **Settings > Integrations** and turn on
   **I have the launcher installed on this computer**.

The first time you click a button, the browser asks whether to open MNCCORE Launcher. Allow it
for the Hub. The first time you click **Work on this in Claude**, macOS asks whether MNCCORE
Launcher may control Terminal. Click **OK**.

If install.sh says another app already opens mnccore:// links, nothing was changed.

**To remove it:** in Terminal, type `bash `, drag **uninstall.sh** in, press Return. It removes
the app, its Terminal permission and its log, then checks that each is gone. Then turn the
Settings switch off.

## Windows

1. Unzip the download (right-click, **Extract All**).
2. Double-click **Install.cmd**. If Windows warns that the file came from the internet, click **Run**.
   No administrator rights are needed; it installs for your Windows account only.
3. Restart your browser.
4. In the Hub, open **Settings > Integrations** and turn on
   **I have the launcher installed on this computer**.

The first time you click a button, the browser asks whether to open the MN-CCORE Launcher.
Tick "Always allow" for the Hub and click **Open**. A PowerShell window may flash for a moment;
that is the launcher.

If Install.cmd says another program already handles mnccore:// links, nothing was changed.
On Nick's laptops that is expected: his Peripheral Brain launcher already does this.

If the window closes with an error saying scripts are disabled on this computer, the computer's
policy blocks PowerShell scripts (some University-managed laptops do). Tell Nick.

**To remove it:** double-click **Uninstall.cmd** (in the download, or run
`%LOCALAPPDATA%\MNCCORE\Launcher\uninstall.ps1`), then turn the Settings switch off.

## Setting your folder

On the project page, under **My folder**, click **+ Add my folder** and paste the full path:

- Mac: in Finder, right-click the folder, hold Option, choose **Copy ... as Pathname**.
  It looks like `/Users/you/Library/CloudStorage/Box-Box/Project`.
- Windows: in File Explorer, hold Shift, right-click the folder, choose **Copy as path**.
  It looks like `C:\Users\you\Box\Project`.

Only you see your folder. Each person sets their own.

## Why Work on asks first

Any website can try to open a mnccore:// link, not just the Hub. Opening a folder in Finder or
Explorer is harmless, so that happens straight away. Starting Claude Code in a folder is not:
Claude Code reads the folder's files, including instructions someone else may have put there.
So the launcher shows the folder and asks. Click **Start Claude Code** (Mac) or **Yes** (Windows)
only if you just clicked **Work on this in Claude** in the Hub yourself.

## What it will not do

It only handles `open` and `workon` links for a folder inside your home folder. It never runs
anything from the link itself, and it never runs a program that sits inside the project folder:
Claude Code is started from where it is installed. If a link is refused you see a short message;
the reason is written to a log (Mac: `~/Library/Logs/mnccore-launcher.log`; Windows:
`%TEMP%\mnccore-launcher.log`).
