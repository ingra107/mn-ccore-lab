-- v42: Project key_links (parity with tasks schema-v37)
-- Run: POST /api/admin/migrate with {"version": 42}
--
-- brain.db already has key_link_{1,2,3} + _desc on projects. Sync path
-- never pushed these to D1 because columns didn't exist. Schema-v37 added
-- equivalents to tasks; this does projects.
--
-- After migration: sync_d1_push.py::push_projects will need mapping (done
-- in PB repo commit alongside this migration).

ALTER TABLE projects ADD COLUMN key_link_1 TEXT;
ALTER TABLE projects ADD COLUMN key_link_1_desc TEXT;
ALTER TABLE projects ADD COLUMN key_link_2 TEXT;
ALTER TABLE projects ADD COLUMN key_link_2_desc TEXT;
ALTER TABLE projects ADD COLUMN key_link_3 TEXT;
ALTER TABLE projects ADD COLUMN key_link_3_desc TEXT;
