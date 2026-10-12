# MN-CCORE Launcher

The launcher lets the Hub open a project folder on your computer and start Claude Code in it.
On a project page, under **My folder**, you save the path to your own copy of that project.
With the launcher installed, two buttons appear next to it:

- **Open folder** opens the folder in File Explorer (Windows) or Finder (Mac).
- **Work on this in Claude** opens a terminal in the folder and starts `claude`.

Without the launcher you still get **Copy path**.

It is small and does only this. It opens a folder only if it exists on this computer, inside
your own user folder. It refuses network shares and every other kind of link.

## Before you start

- Claude Code installed, if you want the Work on button: https://docs.claude.com/en/docs/claude-code/setup
- Your project folders on this computer (Box Drive is fine).

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

**To remove it:** double-click **Uninstall.cmd** (in the download, or run
`%LOCALAPPDATA%\MNCCORE\Launcher\uninstall.ps1`), then turn the Settings switch off.

If Install.cmd says another program already handles mnccore:// links, nothing was changed.
On Nick's laptops that is expected: his Peripheral Brain launcher already does this.

If the window closes with an error about scripts being disabled, your computer's policy blocks
PowerShell scripts. Ask Nick; UMN IT may need to allow it.

## Mac

1. Unzip the download (double-click it).
2. Open **Terminal** (Applications > Utilities). Type `bash ` with a space after it, drag
   **install.sh** from the unzipped folder into the Terminal window, and press Return.
   It builds **MNCCORE Launcher** in your own Applications folder. No password needed.
3. Restart your browser.
4. In the Hub, open **Settings > Integrations** and turn on
   **I have the launcher installed on this computer**.

The first time you click **Work on this in Claude**, macOS asks whether MNCCORE Launcher may
control Terminal. Click **OK**.

**To remove it:** in Terminal, type `bash `, drag **uninstall.sh** in, press Return. Then turn
the Settings switch off.

The Mac version has not yet been tested on a Mac. If something does not work, tell Nick what
you saw.

## Setting your folder

On the project page, under **My folder**, click **+ Add my folder** and paste the full path:

- Windows: in File Explorer, hold Shift, right-click the folder, choose **Copy as path**.
  It looks like `C:\Users\you\Box\Project`.
- Mac: in Finder, right-click the folder, hold Option, choose **Copy ... as Pathname**.
  It looks like `/Users/you/Library/CloudStorage/Box-Box/Project`.

Only you see your folder. Each person sets their own.

## What it will not do

It only handles `open` and `workon` links for a folder inside your user folder. It never runs
anything from the link itself: the folder path is passed to Explorer, Finder or the terminal
as a path, never as a command. If a link is refused you see a short message saying why, and on
Windows a log at `%TEMP%\mnccore-launcher.log`.
