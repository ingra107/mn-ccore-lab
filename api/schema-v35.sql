-- v35: Task recurrence — auto-create next instance when completed
-- Run: POST /api/admin/migrate with {"version": 35}

ALTER TABLE tasks ADD COLUMN recurrence TEXT; -- none, daily, weekly, biweekly, monthly
ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT; -- original task that spawned this one
