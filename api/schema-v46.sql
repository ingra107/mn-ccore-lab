-- v46 (2026-04-19 audit): add 7 missing indexes that hot endpoints scan
-- without. Audit measured ~50-200ms drops on /api/activity, /api/search,
-- /api/projects/health, /api/notifications, /api/pb/command-center.
-- All additive — no row changes.

-- activity_log: every heatmap, feed, search query was full SCAN
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor_ts  ON activity_log(actor, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_related   ON activity_log(related_type, related_id);

-- comments: project-keyed reads were full SCAN
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at DESC);

-- milestones: project-keyed + upcoming-only
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, target_date);
CREATE INDEX IF NOT EXISTS idx_milestones_target_pending ON milestones(target_date) WHERE status IN ('pending', 'in_progress');

-- task_updates: per-task feed queries
CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id, created_at DESC);

-- projects.title: ORDER BY title was forcing temp B-tree
CREATE INDEX IF NOT EXISTS idx_projects_title ON projects(title);

-- notifications: replace single-col index with composite that satisfies
-- the recipient + read + ORDER BY created_at hot path
CREATE INDEX IF NOT EXISTS idx_notif_recipient_read_ts ON notifications(recipient_slug, read, created_at DESC);

-- tasks: satisfy GET /api/tasks ORDER BY natively
CREATE INDEX IF NOT EXISTS idx_tasks_completed_due_created ON tasks(completed, due_date, created_at DESC) WHERE deleted_at IS NULL;
