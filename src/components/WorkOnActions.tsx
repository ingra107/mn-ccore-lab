import { FolderOpen, Play } from 'lucide-react'
import { buildOpenFolderUri, buildWorkOnUri } from '../lib/urlClassify'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'
import { ICON_PROPS } from '../lib/iconProps'

// Shared "Open folder" + "Work on this in Claude" action pair for a project
// that has a primary_folder. Fires the mnccore:// protocol (local launch on
// the machine Nick is sitting at) with a clipboard-copy + toast fallback for
// machines without the handler installed.
//
// Used by ProjectDetail Overview (prominent buttons) and TaskDetailPanel (compact
// icon affordances). `variant` switches between the two presentations; the
// behavior is identical.

interface Props {
  /** The project's local working-folder path (projects.primary_folder). */
  primaryFolder: string
  /** Human label for the project, used in toasts. */
  projectLabel?: string
  variant?: 'buttons' | 'compact'
}

export default function WorkOnActions({ primaryFolder, projectLabel, variant = 'buttons' }: Props) {
  const { launch } = useProtocolLaunch()
  const label = projectLabel ? ` for ${projectLabel}` : ''

  const openFolder = () =>
    launch(buildOpenFolderUri(primaryFolder), {
      copyText: primaryFolder,
      successMessage: 'Opening folder…',
      copyMessage: 'Opening folder… (path copied as backup)',
    })

  const workOn = () =>
    launch(buildWorkOnUri(primaryFolder), {
      copyText: primaryFolder,
      successMessage: `Launching Claude${label} on this machine…`,
      copyMessage: `Launching Claude${label}… (path copied as backup — run "Start Claude.bat" if it doesn't open)`,
    })

  if (variant === 'compact') {
    const iconBtn: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)',
      padding: '2px 4px', flexShrink: 0,
    }
    return (
      <>
        <button type="button" onClick={openFolder} className="tip" data-tip="Open folder" aria-label="Open project folder" style={iconBtn}>
          <FolderOpen {...ICON_PROPS} size={13} />
        </button>
        <button type="button" onClick={workOn} className="tip" data-tip="Work on in Claude" aria-label="Work on this in Claude" style={iconBtn}>
          <Play {...ICON_PROPS} size={13} />
        </button>
      </>
    )
  }

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 'var(--text-small)', fontWeight: 500,
    borderRadius: 'var(--radius-md)', padding: '7px 12px', cursor: 'pointer',
    border: '1px solid var(--border-subtle)',
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openFolder}
        className="tip"
        data-tip="Open in Explorer"
        style={{ ...btn, background: 'var(--ice)', color: 'var(--slate)' }}
      >
        <FolderOpen {...ICON_PROPS} size={14} /> Open folder
      </button>
      <button
        type="button"
        onClick={workOn}
        className="tip"
        data-tip="Launch here"
        style={{ ...btn, background: 'var(--teal-solid)', color: 'var(--ink-bright)', border: '1px solid var(--teal-solid)' }}
      >
        <Play {...ICON_PROPS} size={14} /> Work on this in Claude
      </button>
    </div>
  )
}
