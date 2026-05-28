-- Schema v70: enforce one active (non-soft-deleted) project per slug.
-- Phase 5 (2026-05-27) — applied after the duplicate-active-slug cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_active
  ON projects(slug) WHERE deleted_at IS NULL;
