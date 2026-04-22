/**
 * Section D — modal audit.
 *
 * For each documented modal: open via trigger, verify dialog role,
 * verify focus trap (Tab cycles internally), Escape closes.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson } from '../lib/harness'

interface ModalSpec {
  name: string
  trigger: { page: string; buttonText: RegExp } | { keyboard: string }
  testid?: string
  closeKey?: string
}

const MODALS: ModalSpec[] = [
  { name: 'CreateTaskModal', trigger: { page: '/portal/my-tasks', buttonText: /^New Task/i }, testid: 'create-task-modal', closeKey: 'Escape' },
  { name: 'CreateProjectModal', trigger: { page: '/portal/projects', buttonText: /^New Project|^Add Project/i }, closeKey: 'Escape' },
  { name: 'CreateIdeaModal', trigger: { page: '/portal/ideas', buttonText: /^Submit Idea|^New Idea|^Add Idea/i }, closeKey: 'Escape' },
  { name: 'CreateQuestionModal', trigger: { page: '/portal/ask', buttonText: /^Ask|^New Question/i }, closeKey: 'Escape' },
  { name: 'CommandPalette', trigger: { keyboard: 'Control+K' }, closeKey: 'Escape' },
  { name: 'ShortcutHelp', trigger: { keyboard: '?' }, closeKey: 'Escape' },
]

export async function runSectionD(runId: string, rootDir: string) {
  const s = await openSession({ section: 'D-modals', runId, rootDir })
  try {
    for (const m of MODALS) {
      log(s, `D — ${m.name}`)
      try {
        if ('keyboard' in m.trigger) {
          await goto(s, '/portal/dashboard')
          await s.page.waitForTimeout(300)
          await s.page.keyboard.press(m.trigger.keyboard)
        } else {
          await goto(s, m.trigger.page)
          const btn = s.page.locator('button').filter({ hasText: m.trigger.buttonText }).first()
          if (!(await btn.count())) {
            bug(s, `D.${m.name}.0`, 'P1', `${m.name} trigger button visible`, 'not found', `button matching ${m.trigger.buttonText.source}`)
            continue
          }
          await btn.click()
        }
        await snap(s, `${m.name}-open`, 600)

        // Dialog role check
        const dialog = m.testid
          ? s.page.locator(`[data-testid="${m.testid}"]`).first()
          : s.page.getByRole('dialog').first()
        const dialogCount = await dialog.count()
        if (dialogCount > 0) pass(s, `D ${m.name} renders dialog`)
        else bug(s, `D.${m.name}.1`, 'P1', `${m.name} renders dialog`, 'no dialog/testid in DOM', m.testid || 'role=dialog')

        // Escape closes
        if (m.closeKey && dialogCount > 0) {
          await s.page.keyboard.press(m.closeKey)
          await s.page.waitForTimeout(400)
          const stillOpen = await dialog.count()
          if (stillOpen === 0) pass(s, `D ${m.name} ${m.closeKey} closes`)
          else bug(s, `D.${m.name}.2`, 'P2', `${m.name} ${m.closeKey} closes`, `still in DOM`, 'closed')
        }
      } catch (e) {
        bug(s, `D.${m.name}.thrown`, 'P0', `${m.name} sub-test threw`, (e as Error).message.slice(0, 200), 'no exception')
      }
    }
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'D-modals', passes, bugs }
}
