import type { Env } from '../helpers';
import { json, error, corsHeaders } from '../helpers';

const HUB_URL = 'https://mn-ccore-lab.pages.dev';

// ── Types ─────────────────────────────────────────────────────

interface DigestTask {
  id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
  status: string;
  project_id: string | null;
}

interface DigestMeeting {
  id: string;
  title: string;
  date: string;
  notes: string | null;
}

interface DigestActivity {
  type: string;
  description: string;
  created_at: string;
}

interface DigestData {
  memberSlug: string;
  memberName: string;
  overdue: DigestTask[];
  dueToday: DigestTask[];
  upcoming: DigestTask[];
  meetings: DigestMeeting[];
  recentActivity: DigestActivity[];
  generatedAt: string;
}

// ── Digest generation ─────────────────────────────────────────

export async function generateDigest(memberSlug: string, env: Env): Promise<DigestData> {
  const today = new Date().toISOString().split('T')[0];
  const twoDaysFromNow = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  // Look up the member name from team_members table
  const memberRow = await env.DB.prepare(
    'SELECT name FROM team_members WHERE slug = ?'
  ).bind(memberSlug).first<{ name: string }>();
  const memberName = memberRow?.name || memberSlug;

  const [overdueResult, dueTodayResult, upcomingResult, meetingsResult, activityResult] = await Promise.all([
    // Overdue tasks assigned to this member
    env.DB.prepare(
      `SELECT id, title, due_date, priority, status, project_id FROM tasks
       WHERE assignee = ? AND due_date < ? AND status != 'done' AND completed = 0 AND deleted_at IS NULL
       ORDER BY priority DESC, due_date ASC
       LIMIT 10`
    ).bind(memberSlug, today).all(),

    // Tasks due today
    env.DB.prepare(
      `SELECT id, title, due_date, priority, status, project_id FROM tasks
       WHERE assignee = ? AND due_date = ? AND status != 'done' AND completed = 0 AND deleted_at IS NULL
       ORDER BY priority DESC`
    ).bind(memberSlug, today).all(),

    // Tasks due in the next 7 days (excluding today)
    env.DB.prepare(
      `SELECT id, title, due_date, priority, status, project_id FROM tasks
       WHERE assignee = ? AND due_date > ? AND due_date <= ? AND status != 'done' AND completed = 0 AND deleted_at IS NULL
       ORDER BY due_date ASC, priority DESC
       LIMIT 10`
    ).bind(memberSlug, today, sevenDaysFromNow).all(),

    // Meetings in next 48 hours
    env.DB.prepare(
      `SELECT id, title, date, notes FROM meetings
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC
       LIMIT 5`
    ).bind(today, twoDaysFromNow).all(),

    // Recent activity on their tasks (status changes, comments, assignments) - last 3 days
    env.DB.prepare(
      `SELECT type, description, created_at FROM activity_log
       WHERE (description LIKE ? OR description LIKE ?)
       AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 15`
    ).bind(`%${memberSlug}%`, `%${memberName}%`, threeDaysAgo).all(),
  ]);

  return {
    memberSlug,
    memberName,
    overdue: (overdueResult.results || []) as unknown as DigestTask[],
    dueToday: (dueTodayResult.results || []) as unknown as DigestTask[],
    upcoming: (upcomingResult.results || []) as unknown as DigestTask[],
    meetings: (meetingsResult.results || []) as unknown as DigestMeeting[],
    recentActivity: (activityResult.results || []) as unknown as DigestActivity[],
    generatedAt: new Date().toISOString(),
  };
}

// ── HTML email builder ────────────────────────────────────────

function priorityColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return '#dc2626';
    case 'high': return '#c2410c';
    case 'medium': return '#c9a84c';
    case 'low': return '#94a3b8';
    default: return '#94a3b8';
  }
}

function priorityLabel(priority: string | null): string {
  if (!priority) return '';
  return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:500;color:white;background:${priorityColor(priority)};margin-left:6px;">${priority.toUpperCase()}</span>`;
}

function formatDueDate(due: string | null): string {
  if (!due) return '';
  const d = new Date(due + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function taskRow(task: DigestTask): string {
  const due = task.due_date ? `<span style="color:#94a3b8;font-size:12px;margin-left:8px;">${formatDueDate(task.due_date)}</span>` : '';
  return `<tr>
    <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#0f1923;">
      ${task.title}${priorityLabel(task.priority)}${due}
    </td>
  </tr>`;
}

function sectionHeader(title: string, count: number, color: string): string {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:20px 0 8px 0;">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
      <span style="font-size:14px;font-weight:600;color:#0f1923;">${title}</span>
      <span style="font-size:12px;color:#94a3b8;">(${count})</span>
    </div>`;
}

export function buildDigestHtml(data: DigestData): string {
  const { memberName, overdue, dueToday, upcoming, meetings, recentActivity, generatedAt } = data;

  const greeting = getGreeting();
  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Build sections
  let sectionsHtml = '';

  // Overdue section
  if (overdue.length > 0) {
    const top3 = overdue.slice(0, 3);
    const remaining = overdue.length - 3;
    sectionsHtml += sectionHeader('Overdue', overdue.length, '#dc2626');
    sectionsHtml += `<table style="width:100%;border-collapse:collapse;">${top3.map(taskRow).join('')}</table>`;
    if (remaining > 0) {
      sectionsHtml += `<p style="margin:4px 0 0 16px;font-size:12px;color:#94a3b8;">+ ${remaining} more overdue</p>`;
    }
  }

  // Due today section
  if (dueToday.length > 0) {
    sectionsHtml += sectionHeader('Due Today', dueToday.length, '#c9a84c');
    sectionsHtml += `<table style="width:100%;border-collapse:collapse;">${dueToday.map(taskRow).join('')}</table>`;
  }

  // Upcoming section
  if (upcoming.length > 0) {
    const top5 = upcoming.slice(0, 5);
    sectionsHtml += sectionHeader('Coming Up', upcoming.length, '#2d8a8a');
    sectionsHtml += `<table style="width:100%;border-collapse:collapse;">${top5.map(taskRow).join('')}</table>`;
  }

  // Meetings section
  if (meetings.length > 0) {
    sectionsHtml += sectionHeader('Upcoming Meetings', meetings.length, '#6366f1');
    sectionsHtml += `<table style="width:100%;border-collapse:collapse;">`;
    for (const mtg of meetings) {
      const mtgDate = new Date(mtg.date + 'T00:00:00');
      const dayLabel = mtg.date === new Date().toISOString().split('T')[0] ? 'Today' :
        mtg.date === new Date(Date.now() + 86400000).toISOString().split('T')[0] ? 'Tomorrow' :
        mtgDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      sectionsHtml += `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#0f1923;">
          ${mtg.title}
          <span style="color:#94a3b8;font-size:12px;margin-left:8px;">${dayLabel}</span>
        </td>
      </tr>`;
    }
    sectionsHtml += `</table>`;
  }

  // Recent activity section
  if (recentActivity.length > 0) {
    const top5 = recentActivity.slice(0, 5);
    sectionsHtml += sectionHeader('Recent Activity', recentActivity.length, '#94a3b8');
    sectionsHtml += `<table style="width:100%;border-collapse:collapse;">`;
    for (const act of top5) {
      const ago = timeAgo(act.created_at);
      sectionsHtml += `<tr>
        <td style="padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:12px;color:#64748b;">
          ${act.description}
          <span style="color:#94a3b8;margin-left:6px;">${ago}</span>
        </td>
      </tr>`;
    }
    sectionsHtml += `</table>`;
  }

  // Empty state
  if (!sectionsHtml) {
    sectionsHtml = `
      <div style="text-align:center;padding:32px 0;">
        <div style="font-size:32px;margin-bottom:8px;">&#10003;</div>
        <p style="font-size:14px;color:#64748b;">All clear! No overdue tasks, nothing due today.</p>
      </div>`;
  }

  // Summary counts for header
  const summaryParts: string[] = [];
  if (overdue.length > 0) summaryParts.push(`${overdue.length} overdue`);
  if (dueToday.length > 0) summaryParts.push(`${dueToday.length} due today`);
  if (meetings.length > 0) summaryParts.push(`${meetings.length} meeting${meetings.length > 1 ? 's' : ''}`);
  const summaryLine = summaryParts.length > 0
    ? summaryParts.join(' &middot; ')
    : 'All clear';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MN-CCORE Daily Digest</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:#0b1017;color:#e2e8f0;padding:20px 24px;border-radius:8px 8px 0 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="color:#c9a84c;font-size:16px;">MN-CCORE Hub</strong>
        <span style="font-size:11px;color:#64748b;">${dateStr}</span>
      </div>
      <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">${summaryLine}</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 4px;font-size:15px;color:#0f1923;">${greeting}, ${memberName.split(' ')[0]}.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Here's your daily digest from the Lab Hub.</p>

      ${sectionsHtml}

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${HUB_URL}/my-tasks" style="display:inline-block;padding:10px 28px;background:#2d8a8a;color:white;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
          Open Hub
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px 0;font-size:11px;color:#94a3b8;">
      MN-CCORE Lab Hub &middot; University of Minnesota<br>
      <a href="${HUB_URL}/settings" style="color:#2d8a8a;text-decoration:none;">Manage notifications</a>
    </div>

  </div>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getUTCHours() - 5; // rough CT offset
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── API handlers ──────────────────────────────────────────────

/**
 * POST /api/digest-email — generate daily digest for a member
 * Body: { memberSlug: string }
 * Returns the digest data + HTML content (does NOT send email)
 */
export async function handleGenerateDigestEmail(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json() as { memberSlug?: string };
    if (!body.memberSlug) {
      return error('memberSlug is required', 400);
    }

    const digest = await generateDigest(body.memberSlug, env);
    const html = buildDigestHtml(digest);

    return json({
      data: {
        ...digest,
        html,
        subject: buildSubjectLine(digest),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return error(`Failed to generate digest: ${msg}`, 500);
  }
}

/**
 * GET /api/digest-preview?member=slug — render digest as HTML page for testing
 * Returns raw HTML (not JSON) so it can be viewed in a browser
 */
export async function handleDigestPreview(
  url: URL,
  env: Env,
): Promise<Response> {
  try {
    const memberSlug = url.searchParams.get('member');
    if (!memberSlug) {
      return new Response(
        '<html><body style="font-family:sans-serif;padding:40px;"><h2>Digest Preview</h2><p>Usage: <code>/api/digest-preview?member=nick</code></p><p>Available slugs: nick, nate, mceachron, safadi, etc.</p></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html', ...corsHeaders } },
      );
    }

    const digest = await generateDigest(memberSlug, env);
    const html = buildDigestHtml(digest);

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`<html><body><h2>Error</h2><pre>${msg}</pre></body></html>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html', ...corsHeaders },
    });
  }
}

/**
 * POST /api/digest-email/send — generate and send digest via Resend
 * Body: { memberSlug: string, to: string }
 * Requires RESEND_API_KEY to be configured
 */
export async function handleSendDigestEmail(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json() as { memberSlug?: string; to?: string };
    if (!body.memberSlug || !body.to) {
      return error('memberSlug and to (email address) are required', 400);
    }

    if (!env.RESEND_API_KEY) {
      return error('Email sending not configured (RESEND_API_KEY missing). Use /api/digest-preview to test.', 503);
    }

    const digest = await generateDigest(body.memberSlug, env);
    const html = buildDigestHtml(digest);
    const subject = buildSubjectLine(digest);

    const { sendEmail } = await import('../lib/email');
    const sent = await sendEmail(env.RESEND_API_KEY, {
      to: body.to,
      subject,
      html,
    });

    return json({
      data: {
        sent,
        to: body.to,
        subject,
        overdue: digest.overdue.length,
        dueToday: digest.dueToday.length,
        meetings: digest.meetings.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return error(`Failed to send digest: ${msg}`, 500);
  }
}

function buildSubjectLine(digest: DigestData): string {
  const parts: string[] = [];
  if (digest.overdue.length > 0) parts.push(`${digest.overdue.length} overdue`);
  if (digest.dueToday.length > 0) parts.push(`${digest.dueToday.length} due today`);
  if (digest.meetings.length > 0) parts.push(`${digest.meetings.length} meeting${digest.meetings.length > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'MN-CCORE Daily Digest: All clear';
  return `MN-CCORE Daily Digest: ${parts.join(', ')}`;
}
