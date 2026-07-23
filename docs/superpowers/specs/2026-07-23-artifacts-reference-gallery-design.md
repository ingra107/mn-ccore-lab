# Artifacts Reference Gallery — design

**Date:** 2026-07-23
**Status:** Approved (Nick, 2026-07-23)
**Repo:** mn-ccore-lab (Hub). Companion script changes in Peripheral-Brain.

## Problem

Published artifacts (e.g. the "Aims Funnel Framework" for building a Specific Aims
page) have no findable, shareable home. Today an artifact attaches to one project or
task and is reachable only through that view or a direct `/portal/artifacts/:id`
link. There is no index, no gallery, and no concept of an evergreen "reusable
reference." Great, recyclable artifacts evaporate.

The backend already lists artifacts (`GET /api/artifacts`, `api/routes/artifacts.ts`),
but that list is every artifact newest-first — dominated by ephemeral Hermes
deliverables (per-task email answers), so it can't be shown as-is.

## Goal

A durable **Artifacts** gallery in the Hub where curated, reusable artifacts are
listed, filtered, found, and shared. Reachable from the Lab tier of the sidebar.

## Decisions (locked with Nick)

1. **Collections via multi-tag.** An artifact can carry several collection tags
   (e.g. `grant-writing` + `specific-aims`). Tags are the organizing axis.
2. **The tag is the curation gate.** An artifact appears in the gallery iff it has
   ≥1 tag. No separate `is_reference` flag. Untagged Hermes deliverables stay off
   the shelf automatically.
3. **Nav:** a top-level **Artifacts** item in the **Lab tier** of the sidebar
   (with Meetings / Activity / Analytics / Profile), route `/portal/artifacts`.
4. **Tagging path:** a `--tag` flag on the publish/save scripts *and* an in-Hub
   add/remove-tag editor on the single-artifact page.
5. **Visibility:** the gallery page is team-login (portal). Each artifact keeps its
   own `team`/`public` visibility for external link sharing; the gallery does not
   change who can open a given artifact. A public gallery is out of scope for v1.

## Data model (Hub D1)

New additive join table:

```sql
CREATE TABLE IF NOT EXISTS artifact_tags (
  artifact_id TEXT NOT NULL,
  tag         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (artifact_id, tag),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_artifact_tags_tag ON artifact_tags(tag);
```

- `tag` is stored lowercased/trimmed; the writer normalizes (`normalizeTag`).
- Many-to-many. `ON DELETE CASCADE` so deleting an artifact drops its tags.
- Purely additive: no backfill, no column change. Rollback = `DROP TABLE artifact_tags`.
- Hub-D1-local. Artifacts already live only in D1 (not brain.db), so **no brain.db
  mirror and no cross-repo schema registry entry** are needed for the tags.

## Backend (Cloudflare Worker, `api/`)

New/changed endpoints (mirror `artifacts.ts` + `artifacts.test.ts` patterns):

- `GET /api/artifacts/gallery?tag=<t>` — artifacts having ≥1 tag, newest-first
  (`ORDER BY updated_at DESC, id DESC`), each row includes a `tags: string[]`.
  Optional `?tag=` filters to one tag (server-side; the chip bar can also filter
  client-side once loaded). Returns `{ data, count }`.
- `GET /api/artifact-tags` — distinct tags with counts:
  `SELECT tag, COUNT(*) c FROM artifact_tags GROUP BY tag ORDER BY c DESC, tag`.
  Feeds the filter chips and the editor autocomplete.
- `POST /api/artifacts/:id/tags` `{ tag }` — add a tag (authed team). Validates the
  artifact exists; normalizes; upserts (`INSERT OR IGNORE`). 400 on empty/oversized
  tag (cap length, e.g. 64 chars, allow `[a-z0-9-]` after normalization).
- `DELETE /api/artifacts/:id/tags/:tag` — remove a tag (authed team).

Route registration in `api/index.ts` alongside the existing artifact routes
(specific paths before the `/:id` catch-all, per the existing comment there).

## Frontend (`src/`)

- **Route:** `/portal/artifacts` → `src/pages/portal/ArtifactsGalleryPage.tsx`
  (lazy-loaded in `App.tsx`, same pattern as `ArtifactPage`).
- **Page:** a tag-chip filter bar (multi-select; "All" default) above a responsive
  card grid. Each card: title, its collection tags (as small chips), `created_by`,
  `updated_at`, and an Open link to `/portal/artifacts/:id`. Empty state when no
  artifacts are tagged yet. Data via a `useArtifactGallery` hook + `useArtifactTags`
  (react-query, matching `useApiData` idioms).
- **Nav:** add `{ to: PATHS.artifacts, label: 'Artifacts', icon: <lucide icon> }`
  to the Lab group in `src/components/Sidebar.tsx` (near Analytics / My Profile).
  Add `artifacts: \`${PORTAL_PREFIX}/artifacts\`` to `src/constants/paths.ts`
  (the `artifact(id)` detail helper already exists — keep it). Add a CommandPalette
  entry in `src/components/CommandPalette.tsx` next to Meetings/Activity/Analytics.
- **In-Hub tag editor:** on `src/pages/portal/ArtifactPage.tsx`, an add/remove-tag
  control — existing tags render as removable chips; an input adds a tag with
  autocomplete from `GET /api/artifact-tags`. Wire to the POST/DELETE endpoints
  with optimistic update + react-query invalidation.

## Scripts (Peripheral-Brain, `scripts/links/`)

- `publish_artifact.py` and `save_artifact.py`: add a repeatable `--tag` flag. After
  the artifact is created/saved, POST each tag to `/api/artifacts/:id/tags`.
- New `scripts/links/tag_artifact.py <art_id> --tag <t> [--tag <t> …] [--remove]` to
  tag/untag an existing artifact (used to seed the gallery).

## First resident

Tag the already-published funnel `art_880863ad3a4ca098c2100215a6cab053`
(Aims Funnel Framework) with `grant-writing` and `specific-aims`. It becomes the
gallery's first entry. The interim `peripheral-brain-system` project attachment may
stay or be dropped — tags are now the home.

## Testing

- Backend: unit tests for the four endpoints in the `artifacts.test.ts` style
  (list-gallery filters to tagged rows; tags list counts; add/delete round-trip;
  normalization; auth gate; 400s).
- Frontend: a Playwright smoke — gallery renders, chip filter narrows the grid,
  tag add/remove on the artifact page updates the chips and the gallery.
- Migration applied to prod D1 only after tests are green (orchestrator applies;
  agents commit-only per Hub dispatch norm).

## Sequencing / risk

- The one irreversible slice is the `artifact_tags` D1 migration. It is purely
  additive (`CREATE TABLE` + index, no data touch), rollback is `DROP TABLE`, so it
  is the lowest-risk class of prod-D1 change. Per the Dual-Plan rule the migration
  slice gets an independent cold read before apply; everything else is pure addition
  and ships behind no flag.
- Deploy order: migration → worker (endpoints) → frontend. The gallery is empty and
  harmless until artifacts are tagged, so no flag gating is needed.

## Out of scope (v1)

- A public (cookieless) version of the gallery.
- Reordering / pinning / featured artifacts within a tag.
- Bulk-tagging UI. (The script + per-artifact editor cover curation.)
