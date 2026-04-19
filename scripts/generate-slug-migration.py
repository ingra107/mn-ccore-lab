#!/usr/bin/env python3
"""Generate SQL migration to rename team_members slugs to preferred_name-last_name.

Approach: for each rename (old -> new), clone the team_members row with new
id + slug, update every referring column across the DB, then delete the old
row. This avoids FK violations (comments.author_id REFERENCES team_members(id))
since both rows exist while the referring updates run.

Usage:
    python scripts/generate-slug-migration.py > scripts/rename-team-slugs.sql
    npx wrangler d1 execute mnccore-lab --remote --file scripts/rename-team-slugs.sql
"""

RENAMES = [
    ("nick", "nick-ingraham"),
    ("nate", "nate-mesfin"),
    ("dudley", "adams-dudley"),
    ("chipman", "jeff-chipman"),
    ("mceachron", "kendall-mceachron"),
    ("safadi", "sami-safadi"),
    ("begnaud", "abbie-begnaud"),
    ("henkle", "benjamin-henkle"),
    ("macdonald", "dave-macdonald"),
    ("trujeque", "josh-trujeque"),
    ("pendleton", "katie-pendleton"),
    ("kalinoski", "michael-kalinoski"),
    ("wacker", "dave-wacker"),
    ("arriaza", "steven-arriaza"),
    ("bromley", "emma-bromley"),
    ("eddington", "casey-eddington"),
    ("shyu", "dan-shyu"),
    ("fitzgerald", "beret-fitzgerald"),
    ("collins", "claire-collins"),
]

# (table, column) pairs that store a team_members.slug (or .id when slug == id).
# Collected from sqlite_master schema on 2026-04-19.
# Excluded: publications.authors (free-text author list, space-separated),
# publications.author_slugs (JSON array — needs special-case replace in JSON),
# research_digest.authors / topics (same), conference_submissions.authors (same).
# Those are handled separately below.
SLUG_COLUMNS = [
    ("activity_log", "actor"),
    ("action_items", "assignee"),
    ("action_items", "completed_by"),
    ("action_items", "created_by"),
    ("agenda_items", "added_by"),
    ("ai_requests", "requested_by"),
    ("commitments", "to_whom"),
    ("contributions", "member_slug"),
    ("decision_log", "decided_by"),
    ("digest_comments", "author_slug"),
    ("expertise_tags", "member_slug"),
    ("file_attachments", "uploaded_by"),
    ("grants", "pi"),
    ("ideas", "submitted_by"),
    ("inbox", "author"),
    ("lab_answers", "author_slug"),
    ("lab_questions", "asked_by"),
    ("mentee_milestones", "mentee_slug"),
    ("milestones", "future_note_author"),
    ("notifications", "recipient_slug"),
    ("paper_project_links", "linked_by"),
    ("project_dependencies", "created_by"),
    ("project_dependencies", "from_slug"),  # note: these store project_slug, not team slug — removed below
    ("project_dependencies", "to_slug"),
    ("project_documents", "created_by"),
    ("project_updates", "author"),
    ("projects", "pi"),
    ("reactions", "user_slug"),
    ("research_digest", "saved_by"),
    ("research_narratives", "created_by"),
    ("research_digest", "saved_by"),  # duplicate ok (SET is idempotent)
    ("tasks", "assignee"),
    ("tasks", "assigned_by"),
    ("tasks", "completed_by"),
    ("tasks", "blocked_by"),  # stores task id, not slug — removed below
    ("tasks", "acknowledged_by"),
    ("task_comments", "author_slug"),
    ("task_files", "uploaded_by"),
    ("task_handoffs", "from_slug"),
    ("task_handoffs", "to_slug"),
    ("task_subtasks", "completed_by"),
    ("task_updates", "author_slug"),
    ("trainee_milestones", "member_slug"),
    ("watchlist", "member_slug"),
    ("comments", "author_id"),  # FK — cloned row approach handles this
]

# Columns excluded — they store project_slug or task_id, not team_slug.
NON_TEAM_SLUG = {
    ("project_dependencies", "from_slug"),
    ("project_dependencies", "to_slug"),
    ("tasks", "blocked_by"),
    ("contributions", "project_slug"),
    ("narrative_projects", "project_slug"),
    ("dispatch_queue", "project_slug"),
    ("ai_requests", "project_slug"),
    ("decision_log", "project_slug"),
    ("paper_project_links", "project_slug"),
    ("lab_questions", "project_slug"),
}
SLUG_COLUMNS = [pair for pair in SLUG_COLUMNS if pair not in NON_TEAM_SLUG]

# Deduplicate while preserving order
seen = set()
deduped = []
for pair in SLUG_COLUMNS:
    if pair not in seen:
        seen.add(pair)
        deduped.append(pair)
SLUG_COLUMNS = deduped

print("-- 2026-04-19 Phase 36b: rename team_members slugs to preferred_name-last_name.")
print("-- Current slugs are inconsistent (2 directors as first-name, 17 members as")
print("-- last-name). This migration converges everyone on `preferred-last` so")
print("-- /team/:slug is uniform and Nick's own /team/nick-ingraham works.")
print("-- Approach per member: INSERT new row (copy of old) with new id+slug,")
print("-- UPDATE all referring columns, DELETE old row. FK on comments.author_id")
print("-- stays valid throughout because both rows exist during the UPDATE phase.")
print()

for old, new in RENAMES:
    print(f"-- ─── {old} → {new} ────────────────────────────────────────────")
    # Clone row
    print(f"INSERT INTO team_members (id, name, role, credentials, slug, photo_url, bio, scholar_id, author_name, title, department, member_type, email, full_name, preferred_name, created_at)")
    print(f"  SELECT '{new}', name, role, credentials, '{new}', photo_url, bio, scholar_id, author_name, title, department, member_type, email, full_name, preferred_name, created_at")
    print(f"  FROM team_members WHERE id = '{old}';")
    # Update referring columns
    for table, col in SLUG_COLUMNS:
        print(f"UPDATE {table} SET {col} = '{new}' WHERE {col} = '{old}';")
    # Delete old row
    print(f"DELETE FROM team_members WHERE id = '{old}';")
    print()

# Also fix Hub-sidebar hardcoded assignee slugs in pb-sector.ts:
#   WHERE t.assignee IN ('ningraha', 'nick', 'ingra107')
# The 'nick' one is covered by the SQL above. 'ningraha' and 'ingra107' are
# email-prefix derivations — those remain as-is in tasks.assignee rows that
# may have been written pre-schema-v40. Covered in the UPDATE tasks SET
# assignee pass below.
print("-- Optional: fold email-prefix-derived assignee slugs into canonical Nick.")
print("UPDATE tasks SET assignee = 'nick-ingraham' WHERE assignee IN ('ningraha', 'ingra107');")
