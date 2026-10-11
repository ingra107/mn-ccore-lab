-- Session 2: Real expertise tags for 7 team members
-- Nick Ingraham: PI, critical care
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nick', 'Critical Care');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nick', 'Lung-Protective Ventilation');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nick', 'CLIF Data Standards');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nick', 'Clinical Decision-Making');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nick', 'Causal Inference');

-- Nate Mesfin: Co-Director
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nate', 'Cardiac Arrest');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nate', 'DNR Variation');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nate', 'Chronic Critical Illness');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'nate', 'Health Equity');

-- Casey Eddington: Data Analyst
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'eddington', 'Data Analysis');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'eddington', 'R');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'eddington', 'Python');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'eddington', 'REDCap');

-- Dan Shyu: Fellow
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'shyu', 'Vasopressor Therapy');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'shyu', 'IV Fluid Resuscitation');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'shyu', 'Hemodynamics');

-- Kendall McEachron: Fellow
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'mceachron', 'Cardiac Arrest');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'mceachron', 'Central Line Disparities');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'mceachron', 'Survival Analysis');

-- Beret Fitzgerald: Fellow
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'fitzgerald', 'Palliative Care');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'fitzgerald', 'Goals of Care');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'fitzgerald', 'ICU Communication');

-- Adams Dudley: Senior Mentor
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'dudley', 'Health Services Research');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'dudley', 'Quality Improvement');
INSERT INTO expertise_tags (id, member_slug, tag) VALUES (hex(randomblob(8)), 'dudley', 'Provider Practice Variation');
