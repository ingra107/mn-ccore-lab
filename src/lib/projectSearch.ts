// projectSearch -- finding a project by what it is about, not only its exact
// name (#159, #162, Nick: "whenever searching it should not JUST be the names ...
// obviously that should take precedent ... and the products that are under it
// should all be a thing too"). One matcher for the Projects find box, Browse and
// the ⌘K palette: every word must appear somewhere, and a hit in the name ranks
// above a hit anywhere else.

export interface ProjectSearchable {
  title?: string | null
  short_name?: string | null
  slug?: string | null
  description?: string | null
  pi?: string | null
  category?: string | null
}

export interface ProductSearchable {
  title?: string | null
  short_name?: string | null
  kind_label?: string | null
  venue?: string | null
}

/** Lowercased words; "Cathy's" looks for "cathy". */
export function searchWords(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map((w) => w.replace(/['’]s$/, '')).filter(Boolean)
}

/** Everything a project answers to beyond its name. */
export function projectKeywords(p: ProjectSearchable, products: readonly ProductSearchable[] = []): string {
  const parts: Array<string | null | undefined> = [p.slug, p.description, p.pi, p.category]
  for (const x of products) parts.push(x.title, x.short_name, x.kind_label, x.venue)
  return parts.filter(Boolean).join(' ')
}

/** 0 = every word is in the name, 1 = every word is somewhere, -1 = no match. */
export function projectMatchRank(q: string, p: ProjectSearchable, products: readonly ProductSearchable[] = []): number {
  const words = searchWords(q)
  if (words.length === 0) return 1
  const name = `${p.title ?? ''} ${p.short_name ?? ''}`.toLowerCase()
  if (words.every((w) => name.includes(w))) return 0
  const all = `${name} ${projectKeywords(p, products).toLowerCase()}`
  return words.every((w) => all.includes(w)) ? 1 : -1
}

/** The matching projects, name hits first; otherwise in the order given. */
export function findProjects<T>(q: string, items: readonly T[], rank: (item: T) => number): T[] {
  const ranked = items.map((item) => ({ item, r: rank(item) })).filter((x) => x.r >= 0)
  return [...ranked.filter((x) => x.r === 0), ...ranked.filter((x) => x.r !== 0)].map((x) => x.item)
}

export interface PaletteRankable {
  label: string
  sublabel?: string
  keywords?: string
  category: string
}

/** Palette order for a typed term (#159): a name holding every word (projects
 *  first), then a project's keywords, then words in the sublabel, then the old
 *  in-order fuzzy match, which alone used to fill the 12 rows with tasks. */
export function rankPaletteItems<T extends PaletteRankable>(items: readonly T[], term: string): T[] {
  const words = searchWords(term)
  const q = term.toLowerCase()
  const rankOf = (i: T): number => {
    const label = i.label.toLowerCase()
    const text = `${label} ${(i.sublabel ?? '').toLowerCase()}`
    if (words.every((w) => label.includes(w))) return i.category === 'project' ? 0 : 1
    if (i.keywords && words.every((w) => `${text} ${i.keywords}`.includes(w))) return 2
    if (words.every((w) => text.includes(w))) return 3
    let idx = 0
    for (const char of q) {
      idx = text.indexOf(char, idx)
      if (idx === -1) return -1
      idx++
    }
    return 4
  }
  const buckets: T[][] = [[], [], [], [], []]
  for (const i of items) {
    const r = rankOf(i)
    if (r >= 0) buckets[r].push(i)
  }
  return buckets.flat()
}
