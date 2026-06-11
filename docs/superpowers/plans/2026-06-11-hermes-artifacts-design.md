# Hermes Artifacts — Design Proposal

**Date:** 2026-06-11 · **Status:** PROPOSAL (no implementation)
**Trigger:** Nick, verbatim: "would it be able to write html files instead of that long reply...
what is the best way for artifacts to come back to us... if i wanted this as a link to
SOMETHING... aspirationally this 'artifact' is interactive so we could answer hermes questions
or comment on things and then we can say hermes look at our comments... and then it updates the
document... it needs to be accessible to anyone with access to the link and can edit."
**Immediate motivator:** the 4,262-char aspiration-PNA lit review landed as one giant comment
in a task feed (2026-06-11, ai_request `80e8feee…`).

## Decision frame: what medium?

| Medium | Link-shareable (team) | Interactive loop | Vault-collectable | System of record | Verdict |
|---|---|---|---|---|---|
| **Hub artifact page (md stored, HTML rendered)** | ✓ CF Access already gates `/portal/*` | ✓ rides `activity_entries` + the @hermes lane | ✓ md is the source; one API call | stays in the Hub | **SPINE** |
| Google Doc | ✓ (Google sharing, separate ACL) | ✓ native comments/edits; listener needs Google API plumbing | convert-back step | fragments | **ESCAPE HATCH** (per-artifact "Send to Google Doc") |
| Raw HTML file (R2/Pages) | ✓ | ✗ static; comments would need the Hub anyway | ✗ HTML is a rendering, not a source | orphaned files | reject as storage; HTML is the artifact page's *view* |
| Giant feed comment (status quo) | ✓ but buried | ✓ technically | painful | ✓ | reject for long outputs |

**Core insight:** the unified timeline (Design C) is entity-generic by construction. An
`artifact` entity gets the composer, @me, mentions, reactions, and the @hermes →
`ai_requests` → listener lane FOR FREE. The "aspirational" interactive loop is the
existing machinery pointed at a new entity_type — not new plumbing.

## Design

### 1. Storage — `artifacts` (schema v79, Hub-only, NO PB lockstep)

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,              -- art_<ulid>
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,            -- markdown is the SOURCE format
  version INTEGER NOT NULL DEFAULT 1,
  task_id TEXT,                     -- optional origin links
  project_id TEXT,                  -- typed proj_* (Slice-C convention)
  created_by TEXT NOT NULL,         -- 'claude-ai' for Hermes
  created_at TEXT, updated_at TEXT
);
CREATE TABLE artifact_versions (    -- provenance: every revision preserved
  artifact_id TEXT, version INTEGER, body_md TEXT, revised_by TEXT,
  revision_note TEXT,               -- e.g. "addressed 4 team comments"
  created_at TEXT, PRIMARY KEY (artifact_id, version)
);
```

### 2. The link — `/portal/artifacts/:id`

- Renders `body_md` as a styled page (reuse the feed's markdown renderer; design-system
  typography). The HTML Nick asked for IS this page — no HTML files stored anywhere.
- Below the document: the standard `activity_entries` feed + composer
  (`entity_type='artifact'`), so commenting works exactly like on a task.
- Header: version badge + history dropdown (artifact_versions), origin task/project chips,
  "Copy markdown" + (later) "Send to Google Doc".
- Access = CF Access @umn.edu on `/portal/*` — nothing new. Anyone on the team opens the link.
- Search: add `artifacts` to the 14-entity search per CLAUDE.md Rule 51. OG share card via
  the existing `/og/<type>/<slug>` pattern (Rule 31).

### 3. Hermes write path (listener-side)

In `hub_ai_listener.py`: when a response exceeds a threshold (~1,500 chars) OR the prompt
asks for a document ("write up", "lit review", "summary doc"), the listener:
1. `POST /api/artifacts` {title, body_md, task_id/project_id from the request context}
2. Posts the SHORT feed response via the existing T4 lane: 2-3 sentence summary +
   the artifact link (placeholder still resolved in-place).
Short answers keep behaving exactly as today — artifacts are for deliverables, not chat.

### 4. The interactive loop (the "aspirational" part — mostly already built)

1. Team comments on the artifact page → `activity_entries(entity_type='artifact')`.
2. Anyone writes `@hermes please address the comments` → existing mention detection →
   `ai_requests` row with `source_type='artifact_comment'`, source_id = the entry.
3. Listener handles the new source_type: fetch artifact body + all comments since last
   revision → one bounded generation → `POST /api/artifacts/:id/revise` {body_md,
   revision_note} → version++, old body archived to artifact_versions → short feed reply
   ("Updated to v3 — addressed 4 comments").
4. Repeat. Every version is preserved; Hermes text vs. team input never blurs (same
   provenance principle as the nightly gardener).

**Deliberate v1 boundary:** humans revise via COMMENTS, not direct text editing. This keeps
provenance clean and matches "answer hermes' questions / comment on things → hermes updates."
Direct human editing (a v2 option: inline md editor with `revised_by=<slug>` versions) is
additive later if comment-driven proves insufficient.

### 5. Vault collection (Nick: "i can figure out a way later")

Trivially scriptable now: `GET /api/artifacts?since=` → write `body_md` to
`Context/Artifacts/<date>-<slug>.md` in PB. Could ride /process or the janitor later.
Markdown-as-source makes this a copy, not a conversion.

### 6. Google Docs escape hatch (later, optional)

Per-artifact "Send to Google Doc" action for true co-editing / external collaborators
(grants). One-way export (md → Doc via the existing Workspace MCP/`md_to_docx.py` patterns);
the Doc becomes its own fork — no sync-back pretense.

## Scope

| Piece | Size |
|---|---|
| v79 migration + artifacts routes (CRUD + revise) | S |
| `/portal/artifacts/:id` page (renderer + feed + versions) | M |
| Listener: artifact-worthy detection + write path | S/M |
| Revision lane (`artifact_comment` source_type) | M |
| Search/OG/⌘K integration | S |
| Google-Doc export | deferred |

No PB schema lockstep (Hub-only tables). Sequencing suggestion: ship 1-3 first (artifacts
exist + links in feeds), revision lane second — the lit review becomes the dogfood artifact.

## Open questions for Nick

1. Threshold/trigger for "this becomes an artifact" — length heuristic OK, or explicit
   ("@hermes ... as a document") only?
2. Should artifact comments default team-visible (presumably yes; @me still works)?
3. Naming: "Artifacts" vs "Documents" vs "Reports" in the UI?
