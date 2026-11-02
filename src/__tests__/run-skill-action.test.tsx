// The teal Run button (2026-11-02): renders only for the PI on a computer with the
// launcher, only on an open task with a valid skill, and fires mnccore://run/<task id>
// with no skill text in the URI. Runs in real Chromium with the Today skin CSS, so
// the teal is the computed --job-accent fill, not a class name.
import { describe, it, expect, afterEach } from 'vitest'
import RunSkillAction from '../components/RunSkillAction'
import { UndoToastProvider } from '../components/UndoToast'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { LAUNCHER_STORAGE_KEY } from '../hooks/useLauncherInstalled'

cleanupMountsAfterEach()
afterEach(() => { localStorage.removeItem(LAUNCHER_STORAGE_KEY) })

const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const skin = css.slice(css.indexOf('/* ══ Today skin'))
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + skin
document.head.appendChild(style)

const TASK = 'task_01M6CZS7KZGSA0663NBB3H4HMG'
const PI: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true,
  isMember: true, canShowAllProjects: true, piResolved: true,
}

function render(props: Partial<React.ComponentProps<typeof RunSkillAction>> = {}, user: AuthUser = PI, launcher = true) {
  localStorage.setItem(LAUNCHER_STORAGE_KEY, launcher ? 'yes' : 'no')
  return mount(
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
      <UndoToastProvider>
        <div className="tk" data-probe="1">
          <RunSkillAction taskId={TASK} skill="mnccore-agenda" {...props} />
        </div>
      </UndoToastProvider>
    </AuthContext.Provider>,
    { ready: (h) => h.querySelector('[data-probe]') !== null, label: 'run button host' },
  )
}

const btn = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('button[aria-label^="Run /"]')

describe('RunSkillAction', () => {
  it('shows a teal Run button for the PI and names the skill in its tooltip', async () => {
    const h = await render()
    const b = btn(h)!
    expect(b).not.toBeNull()
    expect(b.textContent).toContain('Run')
    expect(b.getAttribute('data-tip')).toBe('Run /mnccore-agenda in Claude; checks this off when you finish')
    const probe = document.createElement('span')
    probe.style.color = 'var(--job-accent)'
    h.appendChild(probe)
    expect(getComputedStyle(b).backgroundColor).toBe(getComputedStyle(probe).color)
  })

  it('the rail variant labels the skill', async () => {
    const h = await render({ variant: 'rail' })
    expect(btn(h)!.textContent).toContain('Run /mnccore-agenda')
  })

  it('renders nothing for a member, without the launcher, on a done task, or for a bad id or skill', async () => {
    const member = { ...PI, email: 'eddin022@umn.edu', slug: 'casey-eddington', isPi: false, canShowAllProjects: false }
    expect(btn(await render({}, member))).toBeNull()
    expect(btn(await render({}, PI, false))).toBeNull()
    expect(btn(await render({ done: true }))).toBeNull()
    expect(btn(await render({ taskId: 'weekly-review' }))).toBeNull()
    expect(btn(await render({ skill: '../x' }))).toBeNull()
  })
})
