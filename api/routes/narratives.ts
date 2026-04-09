import type { Env } from '../helpers';
import { json } from '../helpers';

const CATEGORY_LABELS: Record<string, string> = {
  clif: 'CLIF Consortium Research',
  lab: 'MN-CCORE Lab Studies',
  nate: 'Mesfin Lab Studies',
  quality: 'Quality Improvement',
  education: 'Medical Education',
  research: 'Research',
};

// GET /api/narratives — auto-detected research arcs
export async function handleNarratives(env: Env): Promise<Response> {
  const [projects, deps, pubs] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, slug, category, stage, status, description, pi FROM projects WHERE status IN ('active', 'Active') ORDER BY category, title"
    ).all(),
    env.DB.prepare('SELECT from_slug, to_slug, relationship_type FROM project_dependencies').all(),
    env.DB.prepare(
      "SELECT id, title, topics, author_slugs, year FROM publications WHERE year >= (CAST(strftime('%Y', 'now') AS INTEGER) - 3) ORDER BY year DESC"
    ).all(),
  ]);

  const projectList = (projects.results || []) as any[];
  const depList = (deps.results || []) as any[];
  const pubList = (pubs.results || []) as any[];

  const stageOrder = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'];

  // Group by category
  const byCategory = new Map<string, any[]>();
  for (const p of projectList) {
    const cat = p.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  const narratives: any[] = [];

  for (const [category, categoryProjects] of byCategory) {
    if (categoryProjects.length < 1) continue;

    // Find connected projects via dependencies
    const connected = new Set<string>();
    for (const d of depList) {
      if (categoryProjects.some((p: any) => p.slug === d.from_slug || p.slug === d.to_slug)) {
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
        const isRelevant = categoryProjects.some((cp: any) => slugs.includes(cp.pi));
        if (isRelevant) {
          for (const t of topics) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
        }
      } catch {}
    }
    const sharedTopics = [...topicCounts.entries()]
      .filter(([, c]) => c >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Stage distribution
    const stageCounts = new Map<string, number>();
    for (const p of categoryProjects) {
      stageCounts.set(p.stage, (stageCounts.get(p.stage) || 0) + 1);
    }

    // Related publications
    const relatedPubs = pubList
      .filter((p: any) => {
        try {
          const slugs = JSON.parse(p.author_slugs || '[]');
          return categoryProjects.some((cp: any) => slugs.includes(cp.pi));
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
      projects: categoryProjects.map((p: any) => ({
        slug: p.slug, title: p.title, stage: p.stage, pi: p.pi, description: p.description,
      })),
      connectedCount: connected.size,
      sharedTopics: sharedTopics.map(([topic, count]) => ({ topic, count })),
      stageDistribution: stageOrder.map((s) => ({ stage: s, count: stageCounts.get(s) || 0 })),
      relatedPubs: relatedPubs.map((p: any) => ({ id: p.id, title: p.title, year: p.year })),
    });
  }

  // Sort by project count descending
  narratives.sort((a, b) => b.projectCount - a.projectCount);

  return json({ data: narratives });
}
