/**
 * MyProjectFolder -- "My folder" on the project page (schema-v127).
 *
 * Each member keeps their own local path for the project (Casey's Box Drive
 * folder on Windows, Steven's on a Mac). Only that person sees it. Anyone sees
 * Copy path; the Open folder and Work on in Claude buttons show only when the
 * person has said, in Settings, that this computer has the launcher (a browser
 * cannot detect a protocol handler, see useLauncherInstalled).
 *
 * A PI with no folder of their own falls back to projects.primary_folder, the
 * Box path PB writes, so Nick's page looks as it did before this panel.
 */
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Copy, FolderOpen, Pencil, X } from 'lucide-react'
import WorkOnActions from '../WorkOnActions'
import { useUndoToast } from '../UndoToast'
import { useMyProjectFolder, useSetMyProjectFolder, useClearMyProjectFolder } from '../../hooks/useMyProjectFolder'
import { useLauncherInstalled } from '../../hooks/useLauncherInstalled'
import { useAuth } from '../../hooks/useAuth'
import { normalizeLocalFolderPath } from '../../lib/urlClassify'
import { checkLocalFolderPath } from '../../../shared/localFolderPath'
import { LABEL_STYLE, LABEL_ICON_COLOR } from '../ui/labelStyle'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'

interface Props {
  /** Project slug (or id) the my-folder routes take. */
  projectRef: string
  projectLabel: string
  /** projects.primary_folder, shown to a PI who has not set a folder of their own. */
  piFallbackFolder: string | null
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
const EXAMPLE = isMac ? '/Users/you/Library/CloudStorage/Box-Box/Project' : 'C:\\Users\\you\\Box\\Project'

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 'var(--text-small)', fontWeight: 500,
  borderRadius: 'var(--radius-md)', padding: '7px 12px', cursor: 'pointer',
  border: '1px solid var(--sk-line2)', background: 'transparent', color: 'var(--slate)',
}
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 24, minHeight: 24, padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)',
}
const hint: React.CSSProperties = { fontSize: 'var(--label-size)', color: 'var(--muted)', margin: 0 }

/** Same folder, whatever the slashes, file:// form or case (Windows paths). */
function sameFolder(a: string, b: string | null): boolean {
  if (!b) return false
  const n = (s: string) => normalizeLocalFolderPath(s).toLowerCase()
  return n(a) === n(b)
}

export default function MyProjectFolder({ projectRef, projectLabel, piFallbackFolder }: Props) {
  const { data, isLoading, isError } = useMyProjectFolder(projectRef)
  const setFolder = useSetMyProjectFolder(projectRef)
  const clearFolder = useClearMyProjectFolder(projectRef)
  const [launcher] = useLauncherInstalled()
  const isPi = Boolean(useAuth().user?.isPi)
  const { showSuccess, showError } = useUndoToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (isLoading || isError || !data) return null
  const mine = data.data?.folder_path ?? null
  const folder = mine ?? piFallbackFolder
  const canSet = data.can_set
  if (!folder && !canSet) return null
  // The PI's launcher is the PB handler, whose workon opens only a project's
  // primary_folder from brain.db (PB never sees Hub My-folder rows). So for the
  // PI the buttons always target primary_folder; a My folder that is some other
  // path gets Copy path and a note instead of buttons that would be refused.
  const piLaunchesOther = isPi && Boolean(mine) && !sameFolder(mine as string, piFallbackFolder)

  const check = checkLocalFolderPath(draft)
  const startEdit = () => { setDraft(mine ?? ''); setTouched(false); setEditing(true) }
  const cancel = () => { setEditing(false); setDraft(''); setTouched(false) }
  const save = () => {
    if (!check.ok) { setTouched(true); return }
    if (check.path === mine) { cancel(); return }
    setFolder.mutate(check.path, {
      onSuccess: () => { showSuccess('Saved your folder for this project'); cancel() },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not save the folder'),
    })
  }
  const clear = () => {
    clearFolder.mutate(undefined, {
      onSuccess: () => showSuccess('Removed your folder for this project'),
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not remove the folder'),
    })
  }
  const copy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      showSuccess('Path copied')
    } catch {
      window.prompt('Copy path:', path)
    }
  }

  return (
    <section aria-label="My folder" data-testid="my-project-folder">
      <div className="flex items-center gap-2 mb-1">
        <FolderOpen {...ICON_PROPS} size={13} style={{ color: LABEL_ICON_COLOR }} aria-hidden="true" />
        <span style={LABEL_STYLE}>My folder</span>
        <span style={hint}>Only you see this</span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="my-folder-input" className="sr-only">Folder path on this computer</label>
          <input
            id="my-folder-input"
            ref={inputRef}
            data-testid="my-folder-input"
            value={draft}
            placeholder={EXAMPLE}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
            aria-invalid={touched && !check.ok ? 'true' : 'false'}
            aria-describedby="my-folder-help"
            spellCheck={false}
            style={{
              width: '100%', fontSize: 'var(--value-size)', padding: '6px 8px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${touched && !check.ok ? 'var(--job-danger)' : 'var(--border-subtle)'}`,
              background: 'var(--surface, transparent)', color: 'var(--ink)',
            }}
          />
          <p id="my-folder-help" data-testid="my-folder-help" style={{ ...hint, color: touched && !check.ok ? 'var(--job-danger)' : 'var(--muted)' }}>
            {touched && !check.ok
              ? check.reason
              : 'Paste the full path to this project\u2019s folder on your computer. In Windows Explorer: Shift + right-click the folder, Copy as path. On a Mac: right-click the folder, hold Option, Copy as Pathname.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={setFolder.isPending} data-testid="my-folder-save"
              style={{ ...smallBtn, background: 'var(--job-accent-solid)', color: 'var(--ink-bright)', border: '1px solid var(--job-accent-solid)' }}>
              Save
            </button>
            <button type="button" onClick={cancel} style={smallBtn}>Cancel</button>
          </div>
        </div>
      ) : folder ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              data-testid="my-folder-path"
              title={folder}
              style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}
            >
              {folder}
            </span>
            {canSet && (
              <button type="button" onClick={startEdit} aria-label={mine ? 'Edit my folder' : 'Set my own folder'} className="tip" data-tip={mine ? 'Edit' : 'Set my own'} style={iconBtn}>
                <Pencil {...ICON_PROPS} size={13} aria-hidden="true" />
              </button>
            )}
            {mine && (
              <button type="button" onClick={clear} disabled={clearFolder.isPending} aria-label="Remove my folder" className="tip" data-tip="Remove" style={iconBtn}>
                <X {...ICON_PROPS} size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          {!mine && <p style={hint}>From Peripheral Brain. Set your own to replace it on this page.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {launcher && piLaunchesOther === false && (
              <WorkOnActions
                primaryFolder={isPi && piFallbackFolder ? piFallbackFolder : folder}
                projectLabel={projectLabel}
                memberLauncher={!isPi}
              />
            )}
            <button type="button" onClick={() => void copy(folder)} data-testid="my-folder-copy" style={smallBtn}>
              <Copy {...ICON_PROPS} size={14} aria-hidden="true" /> Copy path
            </button>
          </div>
          {launcher && piLaunchesOther && (
            <p style={hint} data-testid="my-folder-pi-hint">
              Your laptops&rsquo; launcher opens only the folder Peripheral Brain has for this project
              {piFallbackFolder ? <> ({piFallbackFolder})</> : <> (none set)</>}. Remove My folder to use it, or copy this path.
            </p>
          )}
          {!launcher && (
            <p style={hint} data-testid="my-folder-launcher-hint">
              To open it from here, <Link to={`${PATHS.settings}#integrations`} style={{ color: 'var(--job-accent)' }}>install the launcher</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={startEdit} data-testid="my-folder-add"
            style={{ ...iconBtn, justifyContent: 'flex-start', color: 'var(--job-accent)', fontSize: 'var(--label-size)' }}>
            + Add my folder
          </button>
          <p style={hint}>Keep the path to your own copy of this project here.</p>
        </div>
      )}
    </section>
  )
}
