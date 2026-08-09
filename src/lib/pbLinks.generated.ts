// GENERATED from scripts/links/link_contract.py -- DO NOT EDIT BY HAND.
// rules_hash=e0666c37d7f73ce4cc744932f94e86a085dc02c93b2a978e828e149001f88846
// Regenerate: python -X utf8 scripts/links/gen_links.py (in the Peripheral-Brain repo).
//
// INERT (Phase 1): exported but not imported by app code. urlClassify.ts is the
// live classifier until the P5 cutover. The shared fixture corpus
// (link-fixtures.json) is asserted against normalizeLink() by vitest so this
// interpreter can never silently drift from the PB Python runtime.

export const PB_LINK_TYPES = ["iwd", "google_doc", "google_sheet", "google_slide", "google_form", "box_folder", "github_repo", "github_issue", "github_tree", "gmail_thread", "gmail_draft", "obsidian_note", "local_folder", "local_file", "web", "artifact"] as const
export type PbLinkType = (typeof PB_LINK_TYPES)[number]

export interface PbCanonicalLink {
  type: PbLinkType
  canonical_url: string
  short_title: string
  source_raw: string | null
}

export const PB_LINK_RULES_HASH = 'e0666c37d7f73ce4cc744932f94e86a085dc02c93b2a978e828e149001f88846'

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
    "match": "\\[\\[((?:[^\\]|]*/)?iwd[_-][^\\]|/]*)(?:\\|[^\\]]+)?\\]\\]",
    "title": "\\1",
    "type": "iwd"
  },
  {
    "canonical": "\\0",
    "id_group": 1,
    "match": "obsidian://open\\?[^\\s]*file=((?:[\\w%.+-]*(?:%2[Ff]|/))*iwd[_-](?:(?!%2[Ff])[\\w%.+-])*)(?=$|[&#])",
    "title": "\\1",
    "type": "iwd"
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
    "match": "((?:[A-Za-z]:[\\\\/]|/c/|~/|\\./)[^\\r\\n]*\\.[A-Za-z0-9]{1,5})$",
    "title": "\\1",
    "type": "local_file"
  },
  {
    "canonical": "\\1",
    "id_group": 1,
    "match": "((?:[A-Za-z]:[\\\\/]|/c/|~/|\\./)[^\\r\\n]*)",
    "title": "\\1",
    "type": "local_folder"
  },
  {
    "canonical": "https://mn-ccore-lab.pages.dev/portal/artifacts/\\1",
    "id_group": 1,
    "match": "https?://[^\\s]+/portal/artifacts/(art_[0-9a-fA-F]+)",
    "title": "Artifact",
    "type": "artifact"
  },
  {
    "canonical": "https://claude.ai/code/artifact/\\1",
    "id_group": 1,
    "match": "https?://claude\\.ai/code/artifact/([0-9a-fA-F-]{8,})",
    "title": "Claude Artifact",
    "type": "artifact"
  },
  {
    "canonical": "https://mn-ccore-artifacts.pages.dev/a/\\1",
    "id_group": 1,
    "match": "https?://[^\\s]+/a/(art_[0-9a-fA-F]+)",
    "title": "Artifact",
    "type": "artifact"
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

const LOCAL_TYPES = new Set(['local_file', 'local_folder'])
// Home-dir prefixes for both laptops (work=ingra107, home=ingra via junction).
// Hard-coded so canonicalization is machine-independent; mirrors normalize._HOME_RE.
const HOME_RE = new RegExp('^(?:[A-Za-z]:/|/c/)Users/(?:ingra107|ingra)/')

// Filesystem-aware canonicalization for local paths (#136b) -- mirrors
// normalize.py _canon_local. The rule templates only echo matched text.
function canonLocal(p: string): string {
  p = p.split('\\').join('/')
  p = p.split('%20').join(' ')
  p = p.replace(HOME_RE, '~/')
  return p
}

function normalizeToken(token: string, titleHint?: string | null): PbCanonicalLink | null {
  for (const rule of PB_LINK_RULES) {
    // Start-anchored: rebuild the rule's regex with a leading ^ (the contract
    // patterns are written unanchored, matched at the token start like Python's
    // re.match). Local-path rules end-anchor their extension in the contract.
    const re = new RegExp('^(?:' + rule.match + ')')
    const m = token.match(re)
    if (m) {
      let canonical = expand(rule.canonical, m)
      let title = expand(rule.title, m)
      if (LOCAL_TYPES.has(rule.type)) {
        canonical = canonLocal(canonical)
        title = canonLocal(title)
      }
      return {
        type: rule.type as PbLinkType,
        canonical_url: canonical,
        short_title: titleHint || title,
        source_raw: token !== canonical ? token : null,
      }
    }
  }
  return null
}

function stripTerminal(token: string): string {
  return token.replace(TERMINAL, '')
}

// Whole-raw local-path lane (#1109) -- mirrors normalize.py _whole_raw_local_token.
// The tokenizer bounds tokens at whitespace; when the ENTIRE input is one local
// path, spaces in folder names are path characters, not token boundaries.
const LOCAL_START_RE = /^(?:[A-Za-z]:[\\/]|\/c\/|~\/|\.\/)/
const OTHER_LINK_RE = /https?:\/\/|obsidian:\/\/|\[\[/
const EXT_END_RE = /\.[A-Za-z0-9]{1,5}$/

function wholeRawLocalToken(raw: string): string | null {
  let s = raw.trim()
  if (!s || s.includes('\n') || s.includes('\r')) return null
  const quoted =
    s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]
  if (quoted) s = s.slice(1, -1).trim()
  else s = stripTerminal(s)
  if (!LOCAL_START_RE.test(s)) return null
  if (!s.includes(' ')) return null
  if (quoted) return s
  if (OTHER_LINK_RE.test(s)) return null
  if (EXT_END_RE.test(s)) return s
  if (EXT_END_RE.test(stripTerminal(s.split(' ', 1)[0]))) return null
  return s
}

export function normalizeLink(
  raw: string | null | undefined,
  opts?: { titleHint?: string | null },
): PbCanonicalLink | null {
  if (!raw) return null
  const titleHint = opts?.titleHint ?? null
  const whole = wholeRawLocalToken(raw)
  if (whole !== null) {
    const link = normalizeToken(whole, titleHint)
    if (link) return link
  }
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
