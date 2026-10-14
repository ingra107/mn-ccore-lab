/**
 * ProjectFolderActions -- the folder panel in the project page's side rail.
 *
 * Nick, 2026-10-12: "Why do I need to see where the folder goes? Also, why
 * would I need to copy the path? It's unneeded. I should just have open
 * folder, work on this in Claude, and maybe while you're hovering over those
 * two things, there can be a pencil sign that shows up on the far right that
 * says edit location."
 *
 * So: two actions, no path on screen, no Copy path. The pencil ("Edit
 * location") appears on hover or focus and opens the editor. It keeps the
 * rules MyProjectFolder had (schema-v127): each member's folder is private to
 * them; a PI with none of their own falls back to projects.primary_folder; a
 * PI's launcher opens only primary_folder, so a different My folder hides the
 * buttons rather than offering ones that would be refused.
 *
 * A computer without the launcher gets one link, "Set up the launcher", where
 * the buttons would be (a browser cannot detect a protocol handler, see
 * useLauncherInstalled).
 */
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Pencil, Download } from 'lucide-react'
import WorkOnActions from '../WorkOnActions'
import { useUndoToast } from '../UndoToast'
import { useMyProjectFolder, useSetMyProjectFolder, useClearMyProjectFolder } from '../../hooks/useMyProjectFolder'
import { useLauncherInstalled } from '../../hooks/useLauncherInstalled'
import { useAuth } from '../../hooks/useAuth'
import { normalizeLocalFolderPath } from '../../lib/urlClassify'
import { checkLocalFolderPath } from '../../../shared/localFolderPath'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { Button } from '../ui/Button'

interface Props {
  /** Project slug (or id) the my-folder routes take. */
  projectRef: string
  projectLabel: string
  /** projects.primary_folder, used by a PI who has not set a folder of their own. */
  piFallbackFolder: string | null
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
const EXAMPLE = isMac ? '/Users/you/Library/CloudStorage/Box-Box/Project' : 'C:\\Users\\you\\Box\\Project'

/** Same folder, whatever the slashes, file:// form or case (Windows paths). */
function sameFolder(a: string, b: string | null): boolean {
  if (!b) return false
  const n = (s: string) => normalizeLocalFolderPath(s).toLowerCase()
  return n(a) === n(b)
}

export default function ProjectFolderActions({ projectRef, projectLabel, piFallbackFolder }: Props) {
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
  const piLaunchesOther = isPi && Boolean(mine) && !sameFolder(mine as string, piFallbackFolder)

  const check = checkLocalFolderPath(draft)
  const startEdit = () => { setDraft(mine ?? ''); setTouched(false); setEditing(true) }
  const cancel = () => { setEditing(false); setDraft(''); setTouched(false) }
  const save = () => {
    if (!check.ok) { setTouched(true); return }
    if (check.path === mine) { cancel(); return }
    setFolder.mutate(check.path, {
      onSuccess: () => { showSuccess('Saved the folder location'); cancel() },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not save the folder'),
    })
  }
  const clear = () => {
    clearFolder.mutate(undefined, {
      onSuccess: () => { showSuccess('Removed your folder for this project'); cancel() },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not remove the folder'),
    })
  }

  return (
    <section className="pf" aria-label="Project folder" data-testid="project-folder">
      {editing ? (
        <div className="pf-edit-form">
          <label htmlFor="pf-input" className="pf-label">Folder location on this computer</label>
          <input
            id="pf-input"
            ref={inputRef}
            data-testid="project-folder-input"
            value={draft}
            placeholder={EXAMPLE}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
            aria-invalid={touched && !check.ok ? 'true' : 'false'}
            aria-describedby="pf-help"
            spellCheck={false}
            className="pf-input"
            style={touched && !check.ok ? { borderColor: 'var(--job-danger)' } : undefined}
          />
          <p id="pf-help" data-testid="project-folder-help" className="pf-hint" style={touched && !check.ok ? { color: 'var(--job-danger)' } : undefined}>
            {touched && !check.ok
              ? check.reason
              : 'Paste the full path. In Windows Explorer: Shift + right-click the folder, Copy as path. On a Mac: right-click the folder, hold Option, Copy as Pathname. Only you see it.'}
          </p>
          <div className="pf-actions">
            <button type="button" className="pf-save" onClick={save} disabled={setFolder.isPending} data-testid="project-folder-save">Save</button>
            <button type="button" className="pf-ghost" onClick={cancel}>Cancel</button>
            {mine && (
              <button type="button" className="pf-ghost pf-remove" onClick={clear} disabled={clearFolder.isPending} data-testid="project-folder-remove">
                Remove
              </button>
            )}
          </div>
        </div>
      ) : !folder ? (
        <button type="button" className="pf-add" onClick={startEdit} data-testid="project-folder-add">
          <FolderOpen {...ICON_PROPS} size={14} aria-hidden="true" /> Add folder location
        </button>
      ) : (
        <div className="pf-group">
          {launcher && !piLaunchesOther ? (
            <WorkOnActions
              variant="rail"
              primaryFolder={isPi && piFallbackFolder ? piFallbackFolder : folder}
              projectLabel={projectLabel}
              memberLauncher={!isPi}
            />
          ) : launcher && piLaunchesOther ? (
            <p className="pf-hint" data-testid="project-folder-pi-hint">
              {piFallbackFolder
                ? 'Your launcher opens the folder Peripheral Brain has for this project, not this one. Remove yours to use it.'
                : 'Your launcher opens only the folder set in Peripheral Brain, and none is set for this project yet, so Open folder and Work on this are off.'}
            </p>
          ) : (
            <Link to={`${PATHS.settings}#integrations`} className="pf-setup tip" data-tip="Install it to open this folder and work on it in Claude" data-testid="project-folder-setup">
              <Download {...ICON_PROPS} size={14} aria-hidden="true" /> Set up the launcher
            </Link>
          )}
          {canSet && (
            <Button size="icon"
              type="button"
              className="pf-pencil tip"
              onClick={startEdit}
              aria-label="Edit location"
              data-tip="Edit location"
              data-testid="project-folder-edit"
            >
              <Pencil {...ICON_PROPS} size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      <style>{FOLDER_CSS}</style>
    </section>
  )
}

const FOLDER_CSS = `
.pf-group { display: flex; align-items: center; gap: 6px; }
.pf-pencil {
  flex: 0 0 auto; display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0;
  background: none; border: 0; color: var(--sk-t3); cursor: pointer; border-radius: var(--radius-md);
  opacity: 0; transition: opacity 0.15s;
}
.pf-group:hover .pf-pencil, .pf-group:focus-within .pf-pencil, .pf-pencil:focus-visible { opacity: 1; }
.pf-pencil:hover { color: var(--sk-t1); background: var(--hover-subtle); }
@media (hover: none) { .pf-pencil { opacity: 1; } }
/* 44px touch targets on a touch screen or a phone */
@media (pointer: coarse), (max-width: 640px) {
  .pf-pencil { width: 44px; height: 44px; margin: -10px -10px -10px 0; }
  .pf-save, .pf-ghost, .pf-setup, .pf-add { min-height: 44px; }
}
.pf-setup, .pf-add {
  flex: 1; display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px;
  font-size: var(--text-small); font-weight: 500; color: var(--job-accent); text-decoration: none; cursor: pointer;
  background: transparent; border: 1px dashed var(--sk-line2); border-radius: var(--radius-md); text-align: left;
}
.pf-setup:hover, .pf-add:hover { background: var(--hover-subtle); }
.pf-hint { font-size: var(--label-size); color: var(--sk-t3); margin: 0; line-height: 1.4; }
.pf-label { display: block; font-size: 11px; color: var(--sk-t3); margin-bottom: 4px; }
.pf-edit-form { display: flex; flex-direction: column; gap: 6px; }
.pf-input {
  width: 100%; font-size: var(--value-size); padding: 6px 8px; border-radius: var(--radius-md);
  border: 1px solid var(--sk-line2); background: var(--sk-card); color: var(--sk-t1);
}
.pf-input:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 1px; }
.pf-actions { display: flex; align-items: center; gap: 8px; }
.pf-save {
  background: var(--job-accent-solid); color: var(--ink-bright); border: 0; border-radius: var(--radius-md);
  padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.pf-save:disabled { opacity: 0.45; cursor: default; }
.pf-ghost { background: none; border: 0; padding: 4px 6px; font-size: 12px; color: var(--sk-t2); cursor: pointer; }
.pf-ghost:hover { color: var(--sk-t1); }
.pf-remove { margin-left: auto; }
`
