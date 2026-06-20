// GENERATED from scripts/links/link_contract.py -- DO NOT EDIT BY HAND.
// rules_hash=75b95dc82f3af07753f4756ae6bd5d1c6e75550cb73671a43b4108adda013493
// Regenerate: python -X utf8 scripts/links/gen_links.py (in the Peripheral-Brain repo).
//
// INERT (Phase 1): exported but not imported by app code. urlClassify.ts is the
// live classifier until the P5 cutover. The shared fixture corpus
// (link-fixtures.json) is asserted against normalizeLink() by vitest so this
// interpreter can never silently drift from the PB Python runtime.

export const PB_LINK_TYPES = ["google_doc", "google_sheet", "google_slide", "google_form", "box_folder", "github_repo", "github_issue", "github_tree", "gmail_thread", "gmail_draft", "obsidian_note", "local_folder", "local_file", "script", "web"] as const
export type PbLinkType = (typeof PB_LINK_TYPES)[number]

export interface PbCanonicalLink {
  type: PbLinkType
  canonical_url: string
  short_title: string
  source_raw: string | null
}

export const PB_LINK_RULES_HASH = '75b95dc82f3af07753f4756ae6bd5d1c6e75550cb73671a43b4108adda013493'

interface PbLinkRule {
  type: string
  match: string
  canonical: string
  title: string
  id_group: number
}

const PB_LINK_RULES: PbLinkRule[] = [
  {
    "canonical": "https://docs.google.com/document/d/\\1/edit",
    "id_group": 1,
    "match": "https?://docs\\.google\\.com/document/d/([\\w-]+)",
    "title": "Google Doc",
    "type": "google_doc"
  },
  {
    "canonical": "https://docs.google.com/spreadsheets/d/\\1/edit",
    "id_group": 1,
    "match": "https?://docs\\.google\\.com/spreadsheets/d/([\\w-]+)",
    "title": "Google Sheet",
    "type": "google_sheet"
  },
  {
    "canonical": "https://docs.google.com/presentation/d/\\1/edit",
    "id_group": 1,
    "match": "https?://docs\\.google\\.com/presentation/d/([\\w-]+)",
    "title": "Google Slides",
    "type": "google_slide"
  },
  {
    "canonical": "https://docs.google.com/forms/d/\\1/edit",
    "id_group": 1,
    "match": "https?://docs\\.google\\.com/forms/d/([\\w-]+)",
    "title": "Google Form",
    "type": "google_form"
  },
  {
    "canonical": "https://app.box.com/folder/\\1",
    "id_group": 1,
    "match": "https?://[\\w.-]*box\\.com/folder/(\\d+)",
    "title": "Box folder",
    "type": "box_folder"
  },
  {
    "canonical": "https://app.box.com/s/\\1",
    "id_group": 1,
    "match": "https?://[\\w.-]*box\\.com/s/(\\w+)",
    "title": "Box folder",
    "type": "box_folder"
  },
  {
    "canonical": "https://github.com/\\1/issues/\\2",
    "id_group": 2,
    "match": "https?://github\\.com/([\\w.-]+/[\\w.-]+)/issues/(\\d+)",
    "title": "GitHub issue #\\2",
    "type": "github_issue"
  },
  {
    "canonical": "https://github.com/\\1/tree/\\2",
    "id_group": 1,
    "match": "https?://github\\.com/([\\w.-]+/[\\w.-]+)/tree/([\\w./-]+)",
    "title": "\\1 (\\2)",
    "type": "github_tree"
  },
  {
    "canonical": "https://github.com/\\1",
    "id_group": 1,
    "match": "https?://github\\.com/([\\w.-]+/[\\w.-]+?)(?:\\.git)?/?$",
    "title": "\\1",
    "type": "github_repo"
  },
  {
    "canonical": "\\0",
    "id_group": 1,
    "match": "https?://mail\\.google\\.com/mail/[^\\s]*#drafts?/([\\w-]+)",
    "title": "Gmail draft",
    "type": "gmail_draft"
  },
  {
    "canonical": "\\0",
    "id_group": 1,
    "match": "https?://mail\\.google\\.com/mail/[^\\s]*#[\\w-]+/([\\w-]+)",
    "title": "Gmail thread",
    "type": "gmail_thread"
  },
  {
    "canonical": "[[\\1]]",
    "id_group": 1,
    "match": "\\[\\[([^\\]|]+)(?:\\|[^\\]]+)?\\]\\]",
    "title": "\\1",
    "type": "obsidian_note"
  },
  {
    "canonical": "\\0",
    "id_group": 1,
    "match": "obsidian://open\\?[^\\s]*file=([\\w%./+-]+)",
    "title": "\\1",
    "type": "obsidian_note"
  },
  {
    "canonical": "\\1",
    "id_group": 1,
    "match": "((?:[A-Za-z]:[\\\\/]|/c/|~/|\\./)[^\\s]*\\.(?:py|sh|ps1|js|ts|R|qmd|sql|bat))",
    "title": "\\1",
    "type": "script"
  },
  {
    "canonical": "\\1",
    "id_group": 1,
    "match": "((?:[A-Za-z]:[\\\\/]|/c/|~/|\\./)[^\\s]*\\.[A-Za-z0-9]{1,5})",
    "title": "\\1",
    "type": "local_file"
  },
  {
    "canonical": "\\1",
    "id_group": 1,
    "match": "((?:[A-Za-z]:[\\\\/]|/c/|~/|\\./)[^\\s]*)",
    "title": "\\1",
    "type": "local_folder"
  },
  {
    "canonical": "\\0",
    "id_group": 0,
    "match": "https?://[^\\s]+",
    "title": "Link",
    "type": "web"
  }
]

// Terminal punctuation stripped from the RIGHT of a token before matching.
// ']' excluded so an Obsidian wikilink keeps its closing brackets (mirrors
// normalize.py _TERMINAL).
const TERMINAL = /[.,;:)>"']+$/

// The single link tokenizer (mirrors normalize.py _TOKENIZER). Global so we can
// iterate every token in a body. The drive-letter branch carries a (?<![A-Za-z])
// lookbehind so the `e:` inside "file:///C:/..." is not mistaken for a Windows
// drive letter (#136); the shared fixture corpus is the cross-repo gate.
const TOKENIZER =
  /https?:\/\/\S+|\[\[[^\]]+\]\]|obsidian:\/\/\S+|(?:(?<![A-Za-z])[A-Za-z]:[\\/]|\/c\/|~\/|\.\/)\S+/g

function expand(template: string, m: RegExpMatchArray): string {
  let out = template.split('\\0').join(m[0])
  for (let i = 1; i < m.length; i++) {
    out = out.split('\\' + i).join(m[i] ?? '')
  }
  return out
}

function normalizeToken(token: string, titleHint?: string | null): PbCanonicalLink | null {
  for (const rule of PB_LINK_RULES) {
    // Start-anchored: rebuild the rule's regex with a leading ^ (the contract
    // patterns are written unanchored, matched at the token start like Python's
    // re.match).
    const re = new RegExp('^(?:' + rule.match + ')')
    const m = token.match(re)
    if (m) {
      const canonical = expand(rule.canonical, m)
      return {
        type: rule.type as PbLinkType,
        canonical_url: canonical,
        short_title: titleHint || expand(rule.title, m),
        source_raw: token !== canonical ? token : null,
      }
    }
  }
  return null
}

function stripTerminal(token: string): string {
  return token.replace(TERMINAL, '')
}

export function normalizeLink(
  raw: string | null | undefined,
  opts?: { titleHint?: string | null },
): PbCanonicalLink | null {
  if (!raw) return null
  const titleHint = opts?.titleHint ?? null
  TOKENIZER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKENIZER.exec(raw)) !== null) {
    const link = normalizeToken(stripTerminal(m[0]), titleHint)
    if (link) return link
  }
  return null
}

export function extractLinks(text: string | null | undefined): PbCanonicalLink[] {
  if (!text) return []
  const out: PbCanonicalLink[] = []
  const seen = new Set<string>()
  TOKENIZER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKENIZER.exec(text)) !== null) {
    const link = normalizeToken(stripTerminal(m[0]), null)
    if (link && !seen.has(link.canonical_url)) {
      seen.add(link.canonical_url)
      out.push(link)
    }
  }
  return out
}
