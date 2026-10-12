/**
 * Settings -> Integrations -> Desktop launcher.
 *
 * Downloads the member launcher (member-launcher/ in the Hub repo, zipped at
 * build time by scripts/member-launcher-zip.ts) and holds the "I have the
 * launcher installed" switch. The switch exists because a browser cannot tell
 * whether a mnccore:// handler is installed; see useLauncherInstalled.
 */
import { Download, MonitorDown } from 'lucide-react'
import { useLauncherInstalled } from '../hooks/useLauncherInstalled'
import { ICON_PROPS } from '../lib/iconProps'
import { MEMBER_LAUNCHER_DOWNLOADS } from '../lib/memberLauncherDownloads'

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 'var(--text-small)', fontWeight: 500, textDecoration: 'none',
  borderRadius: 'var(--radius-md)', padding: '7px 12px',
  border: '1px solid var(--border-subtle)', color: 'var(--slate)',
}
const p: React.CSSProperties = { fontSize: 'var(--text-small)', color: 'var(--slate)', margin: 0, lineHeight: 1.5 }

export default function LauncherSettingsPanel() {
  const [installed, setInstalled] = useLauncherInstalled()
  return (
    <section aria-labelledby="launcher-heading" data-testid="launcher-settings" className="mt-8 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MonitorDown {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)' }} aria-hidden="true" />
        <h3 id="launcher-heading" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--sk-t1)', margin: 0 }}>Desktop launcher</h3>
      </div>
      <p style={p}>
        The launcher lets the Hub open your project folder and start Claude Code in it, on this computer.
        Install it once, then add your folder on each project page under <strong>My folder</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={MEMBER_LAUNCHER_DOWNLOADS.windows} download data-testid="launcher-download-windows" style={linkBtn}>
          <Download {...ICON_PROPS} size={14} aria-hidden="true" /> Windows
        </a>
        <a href={MEMBER_LAUNCHER_DOWNLOADS.mac} download data-testid="launcher-download-mac" style={linkBtn}>
          <Download {...ICON_PROPS} size={14} aria-hidden="true" /> Mac
        </a>
      </div>
      <ol style={{ ...p, paddingLeft: 18 }}>
        <li><strong>Windows:</strong> unzip, double-click <code>Install.cmd</code>, then restart your browser.</li>
        <li><strong>Mac:</strong> unzip, open Terminal, type <code>bash </code> (with a space), drag <code>install.sh</code> into the window, press Return.</li>
        <li>The README in the download has the details, and how to remove it.</li>
      </ol>

      <div className="flex items-center justify-between gap-4 mt-2">
        <div>
          <p className="text-sm" style={{ color: 'var(--ink)', margin: 0 }} id="launcher-switch-label">I have the launcher installed on this computer</p>
          <p className="text-[11px]" style={{ color: 'var(--slate)', margin: 0 }} id="launcher-switch-help">
            Your browser cannot check whether the launcher is installed, so tell it here. When this is on, project pages
            show Open folder and Work on in Claude next to your folder. When it is off you get Copy path only.
            This is saved for this browser only, so turn it on separately on each computer that has the launcher.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          data-testid="launcher-switch"
          aria-checked={installed ? 'true' : 'false'}
          aria-labelledby="launcher-switch-label"
          aria-describedby="launcher-switch-help"
          onClick={() => setInstalled(!installed)}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
          style={{
            color: installed ? 'var(--job-accent)' : 'var(--slate)',
            border: `1px solid ${installed ? 'var(--job-accent)' : 'var(--border-subtle)'}`,
            background: installed ? 'color-mix(in srgb, var(--job-accent) 6%, transparent)' : 'none',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {installed ? 'On' : 'Off'}
        </button>
      </div>
    </section>
  )
}
