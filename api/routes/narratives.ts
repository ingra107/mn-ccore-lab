import type { Env } from '../helpers';
import { json } from '../helpers';
import { canonicalizeValue, enumFieldsFor } from '../lib/enum-domains';

const CATEGORY_LABELS: Record<string, string> = {
  clif: 'CLIF Consortium Research',
  lab: 'MN-CCORE Lab Studies',
  nate: 'Mesfin Lab Studies',
  quality: 'Quality Improvement',
  education: 'Medical Education',
  research: 'Research',
};

// GET /api/narratives — auto-detected research arcs
export async function handleGetNarratives(env: Env): Promise<Response> {
  const [projects, deps, pubs] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, slug, category, stage, status, description, pi FROM projects WHERE status = 'active' ORDER BY category, title"
    ).all(),
    // Slice D (2026-06-09): project_dependencies is now keyed on proj_* PKs
    // (from_project_id / to_project_id). Resolve back to slugs via JOIN so the
    // category-grouping logic below (which matches on project.slug) is unchanged.
    env.DB.prepare(
      `SELECT pf.slug AS from_slug, pt.slug AS to_slug, d.relationship_type
       FROM project_dependencies d
       JOIN projects pf ON pf.id = d.from_project_id
       JOIN projects pt ON pt.id = d.to_project_id`,
    ).all(),
    env.DB.prepare(
      "SELECT id, title, topics, author_slugs, year FROM publications WHERE year >= (CAST(strftime('%Y', 'now') AS INTEGER) - 3) ORDER BY year DESC"
    ).all(),
  ]);

  const projectList = (projects.results || []) as Record<string, unknown>[];
  const depList = (deps.results || []) as Record<string, unknown>[];
  const pubList = (pubs.results || []) as Record<string, unknown>[];

  const stageOrder = ['idea', 'data_collection', 'data_analysis', 'writing', 'submitted', 'revisions', 'published'];
  const projectStageDomain = enumFieldsFor('projects')?.stage;

  // Bucket a raw D1 `stage` value onto one of the 7 stageOrder buckets above.
  // Two failure modes this closes (#384): (1) a legacy Title-Case row (e.g.
  // "Idea") previously never matched any lowercase stageOrder key and was
  // silently excluded from every count; (2) the canonical enum domain
  // (enum-domains.generated.json) has an 8th value, 'accepted', that
  // stageOrder has no bucket for — those rows were excluded too. Canonicalize
  // via the SSOT domain (same table mutations.ts validates against), then
  // fold 'accepted' into 'published' to match the frontend's own display
  // collapse (src/lib/stageNormalize.ts STAGE_ALIASES: accepted -> published)
  // so no bucket here silently loses a row. An unmappable/unknown raw value
  // falls through unchanged, preserving prior behavior for anything stranger
  // than the known aliases (won't appear in stageDistribution, same as before).
  function bucketedStage(raw: unknown): string {
    if (typeof raw !== 'string' || !raw) return typeof raw === 'string' ? raw : '';
    const canonical = projectStageDomain ? canonicalizeValue(raw, projectStageDomain) : null;
    const resolved = canonical ?? raw;
    return resolved === 'accepted' ? 'published' : resolved;
  }

  // Group by category
  const byCategory = new Map<string, Record<string, unknown>[]>();
  for (const p of projectList) {
    const cat = p.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  const narratives: Record<string, unknown>[] = [];

  for (const [category, categoryProjects] of byCategory) {
    if (categoryProjects.length < 1) continue;

    // Find connected projects via dependencies
    const connected = new Set<string>();
    for (const d of depList) {
      if (categoryProjects.some((p) => p.slug === d.from_slug || p.slug === d.to_slug)) {
        connected.add(d.from_slug);
        connected.add(d.to_slug);
      }
    }

    // Shared publication topics
    const topicCounts = new Map<string, number>();
    for (const pub of pubList) {
      if (!pub.topics) continue;
      try {
        const topics = JSON.parse(pub.topics) as string[];
        const slugs = pub.author_slugs ? JSON.parse(pub.author_slugs) : [];
        const isRelevant = categoryProjects.some((cp) => slugs.includes(cp.pi));
        if (isRelevant) {
          for (const t of topics) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
        }
      } catch {
        // Malformed topics/author_slugs JSON on a single publication row is
        // tolerated — skip it rather than failing the whole analytics rollup.
      }
    }
    const sharedTopics = [...topicCounts.entries()]
      .filter(([, c]) => c >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Stage distribution
    const stageCounts = new Map<string, number>();
    for (const p of categoryProjects) {
      const s = bucketedStage(p.stage);
      stageCounts.set(s, (stageCounts.get(s) || 0) + 1);
    }

    // Related publications
    const relatedPubs = pubList
      .filter((p) => {
        try {
          const slugs = JSON.parse(p.author_slugs || '[]');
          return categoryProjects.some((cp) => slugs.includes(cp.pi));
        } catch {
          return false;
        }
      })
      .slice(0, 5);

    narratives.push({
      id: category,
      title: CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1),
      category,
      projectCount: categoryProjects.length,
      projects: categoryProjects.map((p) => ({
        slug: p.slug, title: p.title, stage: p.stage, pi: p.pi, description: p.description,
      })),
      connectedCount: connected.size,
      sharedTopics: sharedTopics.map(([topic, count]) => ({ topic, count })),
      stageDistribution: stageOrder.map((s) => ({ stage: s, count: stageCounts.get(s) || 0 })),
      relatedPubs: relatedPubs.map((p) => ({ id: p.id, title: p.title, year: p.year })),
    });
  }

  // Sort by project count descending
  narratives.sort((a, b) => b.projectCount - a.projectCount);

  return json({ data: narratives });
}
