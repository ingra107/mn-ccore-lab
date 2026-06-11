import type { Env } from '../helpers';
import { json } from '../helpers';
import { ctToday } from '../lib/ct-date';

// GET /api/meetings/cadence-check — analyze if next meeting is needed
export async function handleCadenceCheck(env: Env): Promise<Response> {
  // Find the next upcoming meeting
  const nextMeeting = await env.DB.prepare(
    "SELECT id, date, title FROM meetings WHERE date >= date('now') ORDER BY date ASC LIMIT 1"
  ).first<{ id: string; date: string; title: string }>();

  if (!nextMeeting) {
    return json({ data: { recommendation: 'no_upcoming', reason: 'No upcoming meetings found' } });
  }

  // Find the previous meeting
  const prevMeeting = await env.DB.prepare(
    "SELECT id, date FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1"
  ).bind(nextMeeting.date).first<{ id: string; date: string }>();

  const sinceDate = prevMeeting?.date || ctToday(-14);

  // Analyze activity since last meeting
  const [activityCount, pendingActions, newUpdates, agendaItems, blockedTasks] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) as c FROM activity_log WHERE timestamp > ? AND type != 'system'"
    ).bind(sinceDate).first<{ c: number }>(),

    env.DB.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE completed = 0 AND status != 'done'"
    ).first<{ c: number }>(),

    env.DB.prepare(
      "SELECT COUNT(*) as c FROM activity_entries WHERE entity_type='project' AND kind='update' AND created_at > ?"
    ).bind(sinceDate).first<{ c: number }>(),

    env.DB.prepare(
      "SELECT COUNT(*) as c FROM agenda_items WHERE meeting_id = ?"
    ).bind(nextMeeting.id).first<{ c: number }>(),

    env.DB.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE status = 'blocked'"
    ).first<{ c: number }>(),
  ]);

  const activity = activityCount?.c || 0;
  const pending = pendingActions?.c || 0;
  const updates = newUpdates?.c || 0;
  const agenda = agendaItems?.c || 0;
  const blocked = blockedTasks?.c || 0;

  // Score: higher = more reason to meet
  let score = 0;
  const reasons: string[] = [];

  if (blocked > 0) { score += 30; reasons.push(`${blocked} blocked task${blocked > 1 ? 's' : ''} need discussion`); }
  if (agenda > 2) { score += 25; reasons.push(`${agenda} agenda items submitted`); }
  if (updates > 5) { score += 15; reasons.push(`${updates} project updates to review`); }
  if (pending > 10) { score += 10; reasons.push(`${pending} pending tasks across the lab`); }
  if (activity > 20) { score += 10; reasons.push(`${activity} activities since last meeting`); }
  if (agenda <= 1) { score -= 15; reasons.push('Few agenda items — might be a short meeting'); }
  if (activity < 5) { score -= 10; reasons.push('Low activity since last meeting'); }

  let recommendation: string;
  let emoji: string;
  if (score >= 40) { recommendation = 'Full meeting recommended'; emoji = '🟢'; }
  else if (score >= 20) { recommendation = 'Short meeting (30 min)'; emoji = '🟡'; }
  else if (score >= 0) { recommendation = 'Optional — consider async update'; emoji = '🟠'; }
  else { recommendation = 'Consider skipping — send async summary'; emoji = '🔴'; }

  return json({
    data: {
      nextMeeting: { id: nextMeeting.id, date: nextMeeting.date, title: nextMeeting.title },
      score,
      recommendation,
      emoji,
      reasons,
      metrics: { activity, pending, updates, agenda, blocked },
    },
  });
}
