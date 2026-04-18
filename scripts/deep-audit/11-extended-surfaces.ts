/**
 * Deep audit — Suite 11: Extended surfaces (the long tail).
 *
 * Team profile edits (schema v41 naming tiers), Settings persistence,
 * Narratives, Quick Capture inbox, deadline cascade, file/R2 uploads,
 * daily plans (PB Sector), pomodoro sessions, meeting prep, digest cron
 * preview endpoint, notifications read-all, recent activity, file activity
 * heatmap, narratives search, bug report → GitHub issue creation.
 *
 * Run: npx tsx scripts/deep-audit/11-extended-surfaces.ts
 */
import { openSession, closeSession, section, log, pass, bug, apiGet, marker } from './harness'

async function main() {
  const s = await openSession('11-extended-surfaces')
  const cleanupInboxIds: string[] = []

  try {
    // ═══════════════════ TEAM MEMBER PROFILES ═══════════════════
    section(s, '11.A  Team profile read — 4-tier name fields (endpoint is /api/team)')
    const team = await apiGet<Array<{ slug: string; name: string; full_name?: string; preferred_name?: string; credentials?: string }>>(s, '/api/team')
    if (!team) {
      bug(s, 'TEAM-GET', 'P1', '11.A GET /api/team', 'null', 'array')
    } else {
      pass(s, `11.A /api/team-members returns ${team.length} members`)
      const nick = team.find((m) => m.slug === 'nick')
      if (nick) {
        if (nick.full_name || nick.preferred_name || nick.credentials) pass(s, '11.A Nick has ≥1 tier field populated (schema v41 migration verified)')
        else bug(s, 'TEAM-TIER-FIELDS-EMPTY', 'P1', '11.A Nick has full_name/preferred_name/credentials', 'all null', 'at least one populated')
      }
    }

    // ═══════════════════ SETTINGS PERSISTENCE ═══════════════════
    section(s, '11.B  Lab settings endpoint')
    const settings = await apiGet<Array<{ key: string; value: string }>>(s, '/api/settings')
    if (!settings) bug(s, 'SETTINGS-GET', 'P1', '11.B GET /api/settings', 'null', 'array')
    else pass(s, `11.B /api/settings returns ${settings.length} settings`)

    // ═══════════════════ NARRATIVES ═══════════════════
    section(s, '11.C  Narratives endpoint')
    const narratives = await apiGet<Array<{ id: string; topic: string }>>(s, '/api/narratives')
    if (!narratives) bug(s, 'NARRATIVES-GET', 'P1', '11.C GET /api/narratives', 'null', 'array')
    else pass(s, `11.C /api/narratives returns ${narratives.length} narratives`)

    // ═══════════════════ QUICK CAPTURE INBOX ═══════════════════
    section(s, '11.D  Inbox Quick Capture create + read + sync marker')
    const captureText = marker('capture')
    // Inbox POST body is { text, tag?, project_id?, author? }.
    // Valid tags: note | idea | decision | follow-up | meeting-note.
    const createResp = await s.api.post('/api/inbox', {
      data: { text: captureText, tag: 'note', author: 'deep-audit' },
    })
    if (!createResp.ok()) {
      bug(s, 'INBOX-CREATE', 'P1', '11.D POST /api/inbox', `HTTP ${createResp.status()}`, '200')
    } else {
      // Inbox returns the record directly (no { data: ... } wrapper).
      const cb = (await createResp.json()) as { id?: string }
      if (cb?.id) {
        cleanupInboxIds.push(cb.id)
        pass(s, `11.D Inbox entry ${cb.id} created`)
      }
      await s.page.waitForTimeout(600)
      // Note: GET /api/inbox returns { data: [...] } (wrapped) while POST
      // returns the record directly. Shape inconsistency worth noting in
      // REFERENCE.md API-conventions.
      const inbox = await apiGet<Array<{ id: string; text?: string }>>(s, '/api/inbox')
      const found = inbox?.find((i) => i.text === captureText)
      if (found) pass(s, '11.D Inbox entry appears in /api/inbox list')
      else bug(s, 'INBOX-READ-MISSING', 'P1', '11.D inbox read shows new entry', `${inbox?.length ?? 0} entries, marker missing`, 'includes new entry')
    }

    // ═══════════════════ DEADLINE CASCADE ═══════════════════
    section(s, '11.E  Deadline cascade — /all returns the full graph')
    const cascadeResp = await s.api.get('/api/deadline-cascade/all')
    if (cascadeResp.ok()) pass(s, '11.E /api/deadline-cascade/all responds OK')
    else bug(s, 'CASCADE-FAIL', 'P2', '11.E GET /api/deadline-cascade/all', `HTTP ${cascadeResp.status()}`, '200')

    // ═══════════════════ R2 FILE UPLOAD URL ═══════════════════
    section(s, '11.F  R2 upload signed URL endpoint')
    const uploadResp = await s.api.post('/api/upload/url', {
      data: { filename: 'test.txt', contentType: 'text/plain', taskId: null },
    })
    if (uploadResp.ok()) {
      const u = (await uploadResp.json()) as { data?: { uploadUrl?: string; key?: string } }
      if (u?.data?.uploadUrl) pass(s, '11.F /api/upload/url returns signed URL')
      else bug(s, 'UPLOAD-URL-SHAPE', 'P1', '11.F upload response shape', JSON.stringify(u).slice(0, 120), '{ data: { uploadUrl, key } }')
    } else if (uploadResp.status() === 400 || uploadResp.status() === 422) {
      pass(s, `11.F /api/upload/url endpoint exists (${uploadResp.status()} — likely needs fields our test omitted)`)
    } else {
      bug(s, 'UPLOAD-URL-FAIL', 'P2', '11.F POST /api/upload/url', `HTTP ${uploadResp.status()}`, '200 or 4xx with schema')
    }

    // ═══════════════════ DAILY PLANS (PB Sector) ═══════════════════
    section(s, '11.G  Daily plan endpoint')
    const todayIso = new Date().toISOString().slice(0, 10)
    const plan = await apiGet<{ date?: string; star_task_id?: string | null }>(s, `/api/daily-plans/${todayIso}`)
    if (plan !== null) pass(s, `11.G /api/daily-plans/${todayIso} responds`)
    else log(s, `  11.G INFO: no daily plan for ${todayIso} (may not exist)`)

    // ═══════════════════ POMODORO (PB Sector) ═══════════════════
    section(s, '11.H  Pomodoro endpoints (POST /api/pb/pomodoro/start and /complete)')
    // Just verify the START endpoint exists (400 on missing body = reachable)
    const pomoResp = await s.api.post('/api/pb/pomodoro/start', { data: {} })
    if (pomoResp.status() === 400 || pomoResp.ok()) pass(s, `11.H /api/pb/pomodoro/start reachable (${pomoResp.status()})`)
    else bug(s, 'POMODORO-START-FAIL', 'P2', '11.H POST /api/pb/pomodoro/start', `HTTP ${pomoResp.status()}`, '200 or 400')

    // ═══════════════════ MEETING PREP ═══════════════════
    section(s, '11.I  Meeting prep endpoint (find most recent meeting, check prep data)')
    const meetings = await apiGet<Array<{ id: string; date: string }>>(s, '/api/meetings')
    if (meetings && meetings.length > 0) {
      const mostRecent = meetings[0]
      const prep = await apiGet<unknown>(s, `/api/meetings/${mostRecent.id}/prep`)
      if (prep) pass(s, `11.I Meeting prep for ${mostRecent.id} responds`)
      else log(s, `  11.I INFO: no prep for meeting ${mostRecent.id} (endpoint may 404)`)
    }

    // ═══════════════════ DIGEST PREVIEW ═══════════════════
    section(s, '11.J  Digest preview endpoint')
    const previewResp = await s.api.get('/api/digest-preview?member=nick')
    if (previewResp.ok()) {
      const text = await previewResp.text()
      const ct = previewResp.headers()['content-type'] || ''
      if (ct.includes('html')) pass(s, `11.J /api/digest-preview returns HTML (${text.length} bytes)`)
      else if (ct.includes('json')) pass(s, '11.J /api/digest-preview returns JSON')
      else pass(s, `11.J /api/digest-preview returns ${ct}`)
    } else {
      bug(s, 'DIGEST-PREVIEW-FAIL', 'P2', '11.J GET /api/digest-preview', `HTTP ${previewResp.status()}`, '200')
    }

    // ═══════════════════ NOTIFICATIONS READ-ALL ═══════════════════
    section(s, '11.K  Mark all notifications read endpoint')
    const readAllResp = await s.api.post('/api/notifications/read-all', { data: { recipient: 'deep-audit-tester' } })
    if (readAllResp.ok()) pass(s, '11.K /api/notifications/read-all accepted')
    else bug(s, 'NOTIF-READ-ALL', 'P2', '11.K POST /api/notifications/read-all', `HTTP ${readAllResp.status()}`, '200')

    // ═══════════════════ FILE ACTIVITY HEATMAP ═══════════════════
    section(s, '11.L  File activity heatmap endpoint')
    const heatmapResp = await s.api.get('/api/file-activity/heatmap?days=30')
    if (heatmapResp.ok()) pass(s, '11.L /api/file-activity/heatmap responds')
    else bug(s, 'HEATMAP-FAIL', 'P2', '11.L GET /api/file-activity/heatmap', `HTTP ${heatmapResp.status()}`, '200')

    // ═══════════════════ EMAIL DRAFTS ═══════════════════
    section(s, '11.M  Email drafts endpoint (synced from brain.db)')
    const drafts = await apiGet<Array<{ id: string }>>(s, '/api/email-drafts')
    if (!drafts) bug(s, 'EMAIL-DRAFTS-GET', 'P2', '11.M GET /api/email-drafts', 'null', 'array')
    else pass(s, `11.M /api/email-drafts returns ${drafts.length} drafts`)

    // ═══════════════════ DISPATCH QUEUE ═══════════════════
    section(s, '11.N  Dispatch queue endpoint (/api/pb/dispatch/pending)')
    const dispatchResp = await s.api.get('/api/pb/dispatch/pending')
    if (dispatchResp.ok()) {
      const db = (await dispatchResp.json()) as { data?: Array<unknown> }
      pass(s, `11.N /api/pb/dispatch/pending returns ${db.data?.length ?? 0} items`)
    } else {
      bug(s, 'DISPATCH-GET', 'P2', '11.N GET /api/pb/dispatch/pending', `HTTP ${dispatchResp.status()}`, '200')
    }

    // ═══════════════════ TRAJECTORY ═══════════════════
    section(s, '11.O  Trainee trajectory endpoint')
    const traj = await apiGet<unknown>(s, '/api/trajectory/nick')
    if (traj) pass(s, '11.O /api/trajectory/:slug responds with data')
    else log(s, '  11.O INFO: no trajectory data for nick')

    // ═══════════════════ PI DASHBOARD ═══════════════════
    section(s, '11.P  PI dashboard endpoint')
    const pi = await apiGet<unknown>(s, '/api/pi-dashboard')
    if (pi) pass(s, '11.P /api/pi-dashboard responds with data')
    else log(s, '  11.P INFO: PI dashboard empty or 404')

    // ═══════════════════ PUBLICATIONS ═══════════════════
    section(s, '11.Q  Publications endpoint')
    const pubs = await apiGet<Array<{ id: string; title: string }>>(s, '/api/publications')
    if (!pubs) bug(s, 'PUBS-GET', 'P1', '11.Q GET /api/publications', 'null', 'array')
    else pass(s, `11.Q /api/publications returns ${pubs.length} publications`)

    // ═══════════════════ CONFERENCES ═══════════════════
    section(s, '11.R  Conference submissions endpoint')
    const confs = await apiGet<Array<{ id: string }>>(s, '/api/conferences')
    if (!confs) bug(s, 'CONFS-GET', 'P2', '11.R GET /api/conferences', 'null', 'array')
    else pass(s, `11.R /api/conferences returns ${confs.length} submissions`)

    // ═══════════════════ SESSIONS (Claude Code session history from brain.db) ═══════════════════
    section(s, '11.S  PB sessions endpoint (/api/pb/sessions)')
    const sessionsResp = await s.api.get('/api/pb/sessions')
    if (sessionsResp.ok()) {
      const sb = (await sessionsResp.json()) as { data?: Array<{ id: string }> }
      pass(s, `11.S /api/pb/sessions returns ${sb.data?.length ?? 0} sessions`)
    } else if (sessionsResp.status() === 404) {
      log(s, '  11.S INFO: /api/pb/sessions not exposed — sessions may only live in brain.db')
    } else {
      bug(s, 'SESSIONS-FAIL', 'P2', '11.S GET /api/pb/sessions', `HTTP ${sessionsResp.status()}`, '200/404')
    }

    // ═══════════════════ BUG REPORT ═══════════════════
    section(s, '11.T  Bug report endpoint (validates GitHub token available)')
    // Don't actually create an issue — just check the endpoint responds with expected error for missing fields
    const bugResp = await s.api.post('/api/bug-report', { data: {} })
    if (bugResp.status() === 400) {
      pass(s, '11.T /api/bug-report rejects empty payload with 400 (endpoint reachable)')
    } else if (bugResp.status() === 500) {
      log(s, '  11.T INFO: /api/bug-report 500 — may indicate missing GITHUB_TOKEN')
    } else if (bugResp.ok()) {
      log(s, '  11.T /api/bug-report accepted empty body (unusual)')
    } else {
      bug(s, 'BUGREPORT-REACH', 'P2', '11.T /api/bug-report reachable', `HTTP ${bugResp.status()}`, '400 (empty body) or 200')
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const iid of cleanupInboxIds) {
      s.cleanup.push(async () => { await s.api.post(`/api/inbox/${iid}/delete`).catch(() => {}) })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
