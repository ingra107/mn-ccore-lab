-- v39: Add short_name to projects (deliberate display name, synced from brain.db)
ALTER TABLE projects ADD COLUMN short_name TEXT;
