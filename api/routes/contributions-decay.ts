// Canonical contribution-score-with-decay handler. Served at /api/analytics/contributions
// (not /api/contributions-decay). See api/routes/contributions.ts for the raw
// per-member contribution list at /api/team/:slug/contributions — those are distinct.
// 5.3c audit 2026-05-05: dual-path concern verified resolved — one canonical endpoint.
import type { Env } from '../helpers';
import { json } from '../helpers';

// Decay constant: 0.03 gives a half-life of ~23 days (ln(2)/0.03 ≈ 23.1)
const DECAY_CONSTANT = 0.03;

// Base points per contribution type
const BASE_POINTS: Record<string, number> = {
  task: 3,
  comment: 1,
  update: 2,
  decision: 4,
  meeting: 2,
  publication: 10,
};

function decayScore(basePoints: number, daysSinceEvent: number): number {
  return basePoints * Math.exp(-DECAY_CONSTANT * daysSinceEvent);
}

function daysBetween(dateStr: string, now: Date): number {
  const d = new Date(dateStr);
  return Math.max(0, (now.getTime() - d.getTime()) / 86400000);
}

function computeTrend(recentScore: number, olderScore: number): 'increasing' | 'stable' | 'declining' {
  if (olderScore === 0 && recentScore === 0) return 'stable';
  if (olderScore === 0) return 'increasing';
  const ratio = recentScore / olderScore;
  if (ratio > 1.15) return 'increasing';
  if (ratio < 0.85) return 'declining';
  return 'stable';
}

// GET /api/analytics/contributions?slug=&days=90
export async function handleContributionsDecay(url: URL, env: Env): Promise<Response> {
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'slug parameter required' }, 400);

  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const halfCutoff = new Date(now.getTime() - (days / 2) * 86400000).toISOString();

  const [tasks, updates, comments, decisions, meetings, publications] = await Promise.all([
    env.DB.prepare(
      "SELECT completed_at FROM tasks WHERE completed_by LIKE ? AND completed = 1 AND completed_at > ?"
    ).bind(`%${slug}%`, cutoff).all(),

    env.DB.prepare(
      "SELECT created_at FROM project_updates WHERE author LIKE ? AND created_at > ?"
    ).bind(`%${slug}%`, cutoff).all(),

    env.DB.prepare(
      "SELECT created_at FROM comments WHERE author_id LIKE ? AND created_at > ?"
    ).bind(`%${slug}%`, cutoff).all(),

    env.DB.prepare(
      "SELECT created_at FROM decision_log WHERE decided_by LIKE ? AND created_at > ?"
    ).bind(`%${slug}%`, cutoff).all(),

    env.DB.prepare(
      "SELECT DISTINCT m.date FROM meetings m INNER JOIN agenda_items ai ON m.id = ai.meeting_id WHERE ai.added_by LIKE ? AND m.date > ?"
    ).bind(`%${slug}%`, cutoff.split('T')[0]).all(),

    env.DB.prepare(
      "SELECT year FROM publications WHERE author_slugs LIKE ? AND year >= CAST(substr(?, 1, 4) AS INTEGER)"
    ).bind(`%${slug}%`, cutoff.split('T')[0]).all(),
  ]);

  // Calculate decay-weighted scores by type
  const breakdown: Record<string, { count: number; raw_score: number; decay_score: number }> = {};

  function processItems(type: string, items: Record<string, unknown>[], dateField: string) {
    const base = BASE_POINTS[type] || 1;
    let decayTotal = 0;
    let rawTotal = 0;
    let recentDecay = 0;
    let olderDecay = 0;

    for (const item of items) {
      const dateVal = item[dateField] as string;
      if (!dateVal) continue;
      const daysAgo = daysBetween(dateVal, now);
      const score = decayScore(base, daysAgo);
      decayTotal += score;
      rawTotal += base;

      // Split for trend: first half vs second half
      if (dateVal > halfCutoff) {
        recentDecay += score;
      } else {
        olderDecay += score;
      }
    }

    breakdown[type] = {
      count: items.length,
      raw_score: Math.round(rawTotal * 10) / 10,
      decay_score: Math.round(decayTotal * 10) / 10,
    };

    return { decayTotal, rawTotal, recentDecay, olderDecay };
  }

  let totalScore = 0;
  let totalRecentScore = 0;
  let totalOlderScore = 0;

  const types: [string, Record<string, unknown>[], string][] = [
    ['task', (tasks.results || []) as Record<string, unknown>[], 'completed_at'],
    ['update', (updates.results || []) as Record<string, unknown>[], 'created_at'],
    ['comment', (comments.results || []) as Record<string, unknown>[], 'created_at'],
    ['decision', (decisions.results || []) as Record<string, unknown>[], 'created_at'],
    ['meeting', (meetings.results || []) as Record<string, unknown>[], 'date'],
    ['publication', (publications.results || []) as Record<string, unknown>[], 'year'],
  ];

  for (const [type, items, dateField] of types) {
    const result = processItems(type, items, dateField);
    totalScore += result.decayTotal;
    totalRecentScore += result.recentDecay;
    totalOlderScore += result.olderDecay;
  }

  const trend = computeTrend(totalRecentScore, totalOlderScore);

  // Build sparkline: daily scores over last 14 days
  const sparkline: number[] = [];
  for (let d = 13; d >= 0; d--) {
    const dayStart = new Date(now.getTime() - (d + 1) * 86400000);
    const dayEnd = new Date(now.getTime() - d * 86400000);
    let dayScore = 0;

    for (const [type, items, dateField] of types) {
      const base = BASE_POINTS[type] || 1;
      for (const item of items) {
        const dateVal = (item as Record<string, unknown>)[dateField] as string;
        if (!dateVal) continue;
        const itemDate = new Date(dateVal);
        if (itemDate >= dayStart && itemDate < dayEnd) {
          const daysAgo = daysBetween(dateVal, now);
          dayScore += decayScore(base, daysAgo);
        }
      }
    }
    sparkline.push(Math.round(dayScore * 10) / 10);
  }

  return json({
    data: {
      slug,
      days,
      total_score: Math.round(totalScore * 10) / 10,
      trend,
      breakdown,
      sparkline,
      decay_constant: DECAY_CONSTANT,
      half_life_days: Math.round(Math.LN2 / DECAY_CONSTANT * 10) / 10,
    },
  });
}
