-- Seed realistic test data for Final Launch Polish audit
-- Every row has `test_delete_` prefix in id or title for deterministic cleanup.
-- Usage: npx wrangler d1 execute mnccore-lab --remote --file=scripts/seed-test-data.sql
-- Cleanup: scripts/cleanup-test-data.sql

-- ============================================================================
-- 10 IDEAS (mix of new / under_review / approved / parked; real submitters)
-- ============================================================================
INSERT INTO ideas (id, title, description, submitted_by, research_area, status, votes, created_at) VALUES
  ('test_delete_idea_ml_weaning', 'test_delete_Explore ML-based ventilator weaning prediction', 'Could we use the CLIF dataset to train a model that predicts successful SBT? Would need mortality + reintubation as outcomes.', 'shyu', 'ventilation', 'new', 3, datetime('now','-14 days')),
  ('test_delete_idea_ecmo_data', 'test_delete_Add ECMO flows to CLIF v3.1?', 'Mayo and UIC have ECMO data. Adding ECMO-specific fields would unlock severe ARDS analyses.', 'eddington', 'clif', 'under_review', 5, datetime('now','-10 days')),
  ('test_delete_idea_gender_pf', 'test_delete_Gender differences in P/F ratio thresholds', 'Hypothesis: female ARDS patients may need different P/F thresholds due to smaller lung volumes. Could be a short paper.', 'mceachron', 'ards', 'new', 2, datetime('now','-7 days')),
  ('test_delete_idea_fluid_shortage', 'test_delete_Leverage 2022 saline shortage as natural experiment', 'Hospitals switched to LR during shortage — could compare AKI rates before/during/after.', 'nick', 'fluids', 'approved', 8, datetime('now','-30 days')),
  ('test_delete_idea_sepsis_def', 'test_delete_Sepsis-3 criteria sensitivity analysis across sites', 'Different sites have different lactate availability. Should we present a sensitivity analysis in the next paper?', 'nate', 'sepsis', 'under_review', 4, datetime('now','-5 days')),
  ('test_delete_idea_vaso_protocol', 'test_delete_Document vasopressor escalation protocol', 'We have an unwritten order of vasoactive additions. Might be worth publishing as a brief report.', 'shyu', 'hemodynamics', 'new', 6, datetime('now','-3 days')),
  ('test_delete_idea_jc_format', 'test_delete_Switch journal club to structured critical appraisal format', 'Current JC is ad-hoc. Using a standardized form (CASP) would be more useful for trainees.', 'mceachron', 'education', 'new', 4, datetime('now','-2 days')),
  ('test_delete_idea_ats_workshop', 'test_delete_Propose ATS workshop — Running a federated research consortium', 'ATS 2027 workshop submissions are due June. We could do a lessons-learned from CLIF workshop.', 'nick', 'clif', 'approved', 7, datetime('now','-45 days')),
  ('test_delete_idea_onboarding_doc', 'test_delete_Create lab onboarding checklist', 'New fellows are lost for the first month. A living onboarding doc would help.', 'eddington', 'ops', 'new', 9, datetime('now','-1 days')),
  ('test_delete_idea_redcap_audit', 'test_delete_Audit REDCap forms for redundancy', 'We have 3 forms that collect overlapping demographic data. Consolidate to reduce coordinator burden.', 'nate', 'ops', 'parked', 1, datetime('now','-60 days'));

-- ============================================================================
-- 8 DECISIONS (with outcomes, tags, rationale)
-- ============================================================================
INSERT INTO decision_log (id, title, context, rationale, outcome, outcome_status, tags, decided_by, created_at) VALUES
  ('test_delete_dec_ltvv_psm', 'test_delete_Use propensity score matching for LTVV analysis', 'We debated regression adjustment vs IPTW vs PSM for the gender disparities paper.', 'PSM gave the cleanest covariate balance and is familiar to ICU readers. IPTW had extreme weights in subgroups.', 'Propensity score matching with 1:1 caliper 0.2', 'pending', 'statistics,methods,ltvv', 'nick', datetime('now','-20 days')),
  ('test_delete_dec_target_ajrccm', 'test_delete_Target AJRCCM for gender disparities manuscript', 'Considered AJRCCM, Chest, CCM, ATS Journals.', 'Highest impact, best audience match, reviewers likely sympathetic to the gender framing.', 'Submit to AJRCCM first', 'pending', 'publishing,manuscript,ltvv', 'nick', datetime('now','-15 days')),
  ('test_delete_dec_exclude_trauma', 'test_delete_Exclude trauma patients from P/F vs S/F analysis', 'Trauma has different physiology and often needs different tidal volumes.', 'Cleaner signal in primary cohort. Reviewers would have asked for this anyway.', 'Exclude trauma from primary, sensitivity in supplement', 'pending', 'methods,cohort,pf-sf', 'shyu', datetime('now','-25 days')),
  ('test_delete_dec_clif_v3_timeline', 'test_delete_Push CLIF v3.0 release to June', 'Multiple sites reported they would not be ready for April.', 'Better to release right than on time. Casey will coordinate delay messaging.', 'Delay to June 15. Freeze schema May 15.', 'pending', 'clif,release,infrastructure', 'nick', datetime('now','-8 days')),
  ('test_delete_dec_trainee_rotation', 'test_delete_Rotate fellows through CLIF, LTVV, and P/F projects', 'Fellows were asking to work on only one project. PI felt broad exposure was important.', 'Broader training, better lab understanding, more co-authorship.', 'Each fellow does 3-month rotations across three projects in year one', 'positive', 'mentoring,trainees', 'nick', datetime('now','-40 days')),
  ('test_delete_dec_author_order', 'test_delete_First authorship on vasopressor escalation paper', 'Dan led analysis, Casey led data pulling. Order needed clarification.', 'Dan led analysis and wrote first draft. Casey equal-contribution footnote.', 'Dan first, Casey second with equal contribution footnote', 'pending', 'authorship,publishing', 'nick', datetime('now','-12 days')),
  ('test_delete_dec_irb_consolidation', 'test_delete_Consolidate CLIF IRBs across sites', 'Each site had a separate IRB with different expirations. Coordinator overhead was high.', 'Reduces renewal churn from 6/year to 1/year. WIRB agreed to serve as central.', 'Move to a single umbrella IRB with site-level addenda', 'positive', 'irb,infrastructure,regulatory', 'eddington', datetime('now','-50 days')),
  ('test_delete_dec_meeting_cadence', 'test_delete_Move from weekly to biweekly lab meetings', 'Weekly meetings felt redundant when there wasn''t enough new material.', 'Reduces meeting fatigue without losing coordination. Fellows appreciated the extra working time.', 'Biweekly 60-min, with optional async update weeks in between', 'positive', 'meetings,process', 'nick', datetime('now','-70 days'));

-- ============================================================================
-- 11 MENTEE MILESTONES (3 trainees, varied completion)
-- ============================================================================
INSERT INTO mentee_milestones (id, mentee_slug, milestone_type, title, description, due_date, status, completed_at, created_at) VALUES
  ('test_delete_mm_shyu_1', 'shyu', 'presentation', 'test_delete_Present first-author CLIF vasopressor paper at lab meeting', 'Internal presentation before journal submission', '2026-05-01', 'upcoming', NULL, datetime('now','-14 days')),
  ('test_delete_mm_shyu_2', 'shyu', 'abstract', 'test_delete_Submit ATS 2027 abstract on provider variation', 'Abstract deadline Oct 2026. Draft due July for internal review.', '2026-07-15', 'upcoming', NULL, datetime('now','-14 days')),
  ('test_delete_mm_shyu_3', 'shyu', 'coursework', 'test_delete_Complete biostatistics course', 'UMN BSPH 6850 — fundamentals of biostatistics', '2026-03-30', 'completed', '2026-03-15', datetime('now','-80 days')),
  ('test_delete_mm_shyu_4', 'shyu', 'exam', 'test_delete_Pass pulmonary boards', 'Pulmonary certification board exam', '2026-10-15', 'upcoming', NULL, datetime('now','-30 days')),
  ('test_delete_mm_eddington_1', 'eddington', 'presentation', 'test_delete_Lead data architecture meeting for CLIF v3', 'Present proposed v3 schema changes to full consortium', '2026-04-30', 'upcoming', NULL, datetime('now','-7 days')),
  ('test_delete_mm_eddington_2', 'eddington', 'certification', 'test_delete_Complete REDCap admin certification', 'Institutional cert for REDCap project management', '2026-06-15', 'upcoming', NULL, datetime('now','-10 days')),
  ('test_delete_mm_eddington_3', 'eddington', 'manuscript', 'test_delete_Coauthor 2 manuscripts this year', 'Target: 2 coauthored papers published or in press by end of FY', '2026-12-31', 'upcoming', NULL, datetime('now','-30 days')),
  ('test_delete_mm_mceachron_1', 'mceachron', 'manuscript', 'test_delete_First-author IHCA survivability calculator paper', 'Manuscript target: CCM. First draft due June.', '2026-06-30', 'upcoming', NULL, datetime('now','-20 days')),
  ('test_delete_mm_mceachron_2', 'mceachron', 'grant', 'test_delete_Apply for K23 award', 'K23 Mentored Patient-Oriented Research submission, Oct 2026', '2026-10-12', 'upcoming', NULL, datetime('now','-20 days')),
  ('test_delete_mm_mceachron_3', 'mceachron', 'workshop', 'test_delete_Attend NIH K award workshop', 'In-person 2-day workshop at Johns Hopkins', '2026-05-20', 'upcoming', NULL, datetime('now','-5 days')),
  ('test_delete_mm_mceachron_4', 'mceachron', 'manuscript', 'test_delete_Publish co-authored LTVV paper', 'Secondary authorship on the gender disparities paper', '2026-07-31', 'upcoming', NULL, datetime('now','-15 days'));

-- ============================================================================
-- 4 REGULATORY / IRB ITEMS (linked to real projects)
-- ============================================================================
INSERT INTO regulatory_items (id, project_id, item_type, title, protocol_number, approved_date, expiration_date, renewal_due, status, notes, created_at) VALUES
  ('test_delete_reg_clif_irb', 'p1-gender-disparities-low-tidal-volume', 'IRB', 'test_delete_CLIF Consortium Central IRB', 'WIRB-CLIF-2025-001', '2025-09-15', '2026-09-15', '2026-07-15', 'active', 'WIRB central IRB — renewal 60 days before expiration', datetime('now','-180 days')),
  ('test_delete_reg_ltvv_dua', 'p1-gender-disparities-low-tidal-volume', 'DUA', 'test_delete_LTVV Analysis Data Use Agreement', 'DUA-LTVV-2025', '2025-07-30', '2026-07-30', '2026-05-30', 'active', 'DUA with 6 participating sites — Emma handles renewal', datetime('now','-200 days')),
  ('test_delete_reg_gdms_irb', 'pf-v-sf-oxygenation-severity', 'IRB', 'test_delete_Decision Making Styles Survey IRB', 'UMN-IRB-2025-0047', '2025-06-01', '2026-06-01', '2026-04-01', 'expiring_soon', 'UMN IRB, expedited review — renewal paperwork in progress', datetime('now','-220 days')),
  ('test_delete_reg_cci_dua', 'iv-fluids-shortage', 'DUA', 'test_delete_CCI-ARDS Data Use Agreement', 'DUA-CCI-2025', '2025-05-15', '2026-05-15', '2026-03-15', 'action_needed', 'Renewal paperwork started, pending legal review', datetime('now','-250 days'));

-- ============================================================================
-- 2 GRANTS + 5 GRANT MILESTONES
-- ============================================================================
INSERT INTO grants (id, mechanism, title, agency, pi, start_date, end_date, proposed, total_funding, created_at) VALUES
  ('test_delete_grant_r01_ml_icu', 'R01', 'test_delete_R01 — Machine Learning for ICU Outcome Prediction', 'NHLBI', 'Nick Ingraham', '2027-04-01', '2032-03-31', 1, 2400000, datetime('now','-60 days')),
  ('test_delete_grant_k23_ihca', 'K23', 'test_delete_K23 — IHCA Survivability Calculator Development', 'NHLBI', 'Kendall McEachron', '2026-12-01', '2031-11-30', 1, 750000, datetime('now','-90 days'));

INSERT INTO grant_milestones (id, grant_id, milestone_type, title, due_date, status, notes, created_at) VALUES
  ('test_delete_gm_r01_loi', 'test_delete_grant_r01_ml_icu', 'letter_of_intent', 'test_delete_Submit Letter of Intent', '2026-06-15', 'upcoming', 'LOI to program officer', datetime('now','-60 days')),
  ('test_delete_gm_r01_aims', 'test_delete_grant_r01_ml_icu', 'specific_aims', 'test_delete_Draft Specific Aims', '2026-07-30', 'upcoming', 'Internal review before external feedback', datetime('now','-60 days')),
  ('test_delete_gm_r01_submit', 'test_delete_grant_r01_ml_icu', 'submission', 'test_delete_Full submission due', '2026-10-05', 'upcoming', 'NIH standard receipt date', datetime('now','-60 days')),
  ('test_delete_gm_k23_letters', 'test_delete_grant_k23_ihca', 'mentor_letters', 'test_delete_Secure 3 mentor letters', '2026-09-01', 'upcoming', 'Nick primary + 2 secondary', datetime('now','-90 days')),
  ('test_delete_gm_k23_biosketch', 'test_delete_grant_k23_ihca', 'biosketch', 'test_delete_Update biosketch', '2026-08-15', 'completed', 'Updated with 2025 publications', datetime('now','-90 days'));

-- ============================================================================
-- 6 TASKS (assigned to non-Nick team members, linked to real projects)
-- ============================================================================
INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, project_id, created_at, updated_at) VALUES
  ('test_delete_task_casey_cci', 'test_delete_Pull updated CCI-ARDS cohort counts for Dan', 'Updated numbers needed for methods section table', 'eddington', 'high', 'in_progress', '2026-04-18', 'iv-fluids-shortage', datetime('now','-3 days'), datetime('now')),
  ('test_delete_task_dan_analysis', 'test_delete_Re-run vasopressor escalation analysis with new exclusion criteria', 'Apply exclusion decision from last meeting', 'shyu', 'high', 'todo', '2026-04-20', 'p1-gender-disparities-low-tidal-volume', datetime('now','-2 days'), datetime('now')),
  ('test_delete_task_kendall_aims', 'test_delete_Draft K23 specific aims v1', 'First version of aims, focus on IHCA survivability', 'mceachron', 'medium', 'in_progress', '2026-05-01', NULL, datetime('now','-5 days'), datetime('now')),
  ('test_delete_task_casey_redcap', 'test_delete_Export REDCap data for gender disparities final analysis', 'Need locked dataset for manuscript submission', 'eddington', 'urgent', 'todo', '2026-04-16', 'p1-gender-disparities-low-tidal-volume', datetime('now','-1 days'), datetime('now')),
  ('test_delete_task_dan_review', 'test_delete_Review Dudley grant writing club material', 'Read pre-circulated R01 aims page for feedback', 'shyu', 'low', 'todo', '2026-04-17', NULL, datetime('now','-1 days'), datetime('now')),
  ('test_delete_task_kendall_k23', 'test_delete_Submit registration for K23 workshop at Hopkins', 'In-person 2-day workshop, deadline April 25', 'mceachron', 'medium', 'todo', '2026-04-25', NULL, datetime('now','-2 days'), datetime('now'));

-- ============================================================================
-- 13 EXPERTISE TAGS (3-4 per key member)
-- ============================================================================
INSERT INTO expertise_tags (id, member_slug, tag, source, created_at) VALUES
  ('test_delete_tag_nick_1', 'nick', 'test_delete_Clinical Epidemiology', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_nick_2', 'nick', 'test_delete_Causal Inference', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_nick_3', 'nick', 'test_delete_ARDS', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_nick_4', 'nick', 'test_delete_Machine Learning', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_shyu_1', 'shyu', 'test_delete_Hemodynamics', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_shyu_2', 'shyu', 'test_delete_Vasopressor Therapy', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_shyu_3', 'shyu', 'test_delete_Python', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_eddington_1', 'eddington', 'test_delete_REDCap', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_eddington_2', 'eddington', 'test_delete_Data Pipeline Engineering', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_eddington_3', 'eddington', 'test_delete_Project Coordination', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_mceachron_1', 'mceachron', 'test_delete_Cardiac Arrest', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_mceachron_2', 'mceachron', 'test_delete_Resuscitation', 'manual', datetime('now','-10 days')),
  ('test_delete_tag_mceachron_3', 'mceachron', 'test_delete_Survival Analysis', 'manual', datetime('now','-10 days'));

-- ============================================================================
-- 45 ACTIVITY LOG ENTRIES (realistic pattern over last 90 days)
-- Note: activity_log schema: (id, type, description, related_id, related_type, actor, timestamp)
-- ============================================================================
INSERT INTO activity_log (id, type, description, related_id, related_type, actor, timestamp) VALUES
  ('test_delete_act_001', 'task_update', 'test_delete_Assigned task to Dan Shyu', 'test_delete_task_dan_analysis', 'task', 'nick', datetime('now','-2 days')),
  ('test_delete_act_002', 'task_complete', 'test_delete_Completed biostatistics course', 'test_delete_mm_shyu_3', 'milestone', 'shyu', datetime('now','-28 days')),
  ('test_delete_act_003', 'idea_create', 'test_delete_Submitted new idea — ECMO flows to CLIF v3.1', 'test_delete_idea_ecmo_data', 'idea', 'eddington', datetime('now','-15 days')),
  ('test_delete_act_004', 'idea_vote', 'test_delete_Voted on onboarding checklist idea', 'test_delete_idea_onboarding_doc', 'idea', 'mceachron', datetime('now','-1 days')),
  ('test_delete_act_005', 'decision_log', 'test_delete_Logged decision — Use PSM for LTVV analysis', 'test_delete_dec_ltvv_psm', 'decision', 'nick', datetime('now','-20 days')),
  ('test_delete_act_006', 'task_update', 'test_delete_Updated task priority to urgent', 'test_delete_task_casey_redcap', 'task', 'eddington', datetime('now','-15 days')),
  ('test_delete_act_007', 'milestone_complete', 'test_delete_Completed K23 biosketch update', 'test_delete_gm_k23_biosketch', 'grant_milestone', 'mceachron', datetime('now','-7 days')),
  ('test_delete_act_008', 'task_create', 'test_delete_Created task — Draft K23 specific aims', 'test_delete_task_kendall_aims', 'task', 'mceachron', datetime('now','-5 days')),
  ('test_delete_act_009', 'idea_create', 'test_delete_Submitted new idea — Vasopressor protocol', 'test_delete_idea_vaso_protocol', 'idea', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_010', 'idea_vote', 'test_delete_Voted on ATS workshop idea', 'test_delete_idea_ats_workshop', 'idea', 'nate', datetime('now','-40 days')),
  ('test_delete_act_011', 'decision_log', 'test_delete_Logged decision — Target AJRCCM for LTVV', 'test_delete_dec_target_ajrccm', 'decision', 'nick', datetime('now','-15 days')),
  ('test_delete_act_012', 'task_update', 'test_delete_Moved CCI cohort task to in_progress', 'test_delete_task_casey_cci', 'task', 'eddington', datetime('now','-15 days')),
  ('test_delete_act_013', 'idea_create', 'test_delete_Submitted new idea — ML ventilator weaning', 'test_delete_idea_ml_weaning', 'idea', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_014', 'decision_log', 'test_delete_Logged decision — Exclude trauma from P/F analysis', 'test_delete_dec_exclude_trauma', 'decision', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_015', 'idea_vote', 'test_delete_Voted on journal club format change', 'test_delete_idea_jc_format', 'idea', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_016', 'task_create', 'test_delete_Created task — K23 workshop registration', 'test_delete_task_kendall_k23', 'task', 'mceachron', datetime('now','-2 days')),
  ('test_delete_act_017', 'milestone_create', 'test_delete_Added mentee milestone — Pass pulmonary boards', 'test_delete_mm_shyu_4', 'milestone', 'nick', datetime('now','-30 days')),
  ('test_delete_act_018', 'decision_log', 'test_delete_Logged decision — Delay CLIF v3 to June', 'test_delete_dec_clif_v3_timeline', 'decision', 'nick', datetime('now','-8 days')),
  ('test_delete_act_019', 'idea_create', 'test_delete_Submitted idea — Sepsis-3 sensitivity', 'test_delete_idea_sepsis_def', 'idea', 'nate', datetime('now','-5 days')),
  ('test_delete_act_020', 'task_update', 'test_delete_Reviewed Dudley grant material', 'test_delete_task_dan_review', 'task', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_021', 'idea_vote', 'test_delete_Voted on fluid shortage natural experiment', 'test_delete_idea_fluid_shortage', 'idea', 'eddington', datetime('now','-25 days')),
  ('test_delete_act_022', 'regulatory', 'test_delete_Started CCI DUA renewal paperwork', 'test_delete_reg_cci_dua', 'regulatory', 'eddington', datetime('now','-14 days')),
  ('test_delete_act_023', 'milestone_create', 'test_delete_Added milestone — Lead CLIF v3 architecture meeting', 'test_delete_mm_eddington_1', 'milestone', 'nick', datetime('now','-7 days')),
  ('test_delete_act_024', 'task_update', 'test_delete_Assigned K23 workshop task', 'test_delete_task_kendall_k23', 'task', 'mceachron', datetime('now','-2 days')),
  ('test_delete_act_025', 'idea_create', 'test_delete_Submitted idea — Onboarding checklist', 'test_delete_idea_onboarding_doc', 'idea', 'eddington', datetime('now','-15 days')),
  ('test_delete_act_026', 'decision_log', 'test_delete_Logged decision — Rotate fellows across projects', 'test_delete_dec_trainee_rotation', 'decision', 'nick', datetime('now','-40 days')),
  ('test_delete_act_027', 'idea_vote', 'test_delete_Voted on ECMO flows addition', 'test_delete_idea_ecmo_data', 'idea', 'mceachron', datetime('now','-8 days')),
  ('test_delete_act_028', 'task_update', 'test_delete_Changed REDCap export priority to urgent', 'test_delete_task_casey_redcap', 'task', 'nick', datetime('now','-1 days')),
  ('test_delete_act_029', 'decision_log', 'test_delete_Logged decision — Author order vasopressor paper', 'test_delete_dec_author_order', 'decision', 'nick', datetime('now','-12 days')),
  ('test_delete_act_030', 'milestone_create', 'test_delete_Added mentee milestone — K23 application', 'test_delete_mm_mceachron_2', 'milestone', 'nick', datetime('now','-20 days')),
  ('test_delete_act_031', 'regulatory', 'test_delete_GDMS IRB marked expiring soon', 'test_delete_reg_gdms_irb', 'regulatory', 'eddington', datetime('now','-15 days')),
  ('test_delete_act_032', 'idea_vote', 'test_delete_Voted on vasopressor protocol doc', 'test_delete_idea_vaso_protocol', 'idea', 'nick', datetime('now','-3 days')),
  ('test_delete_act_033', 'task_create', 'test_delete_Created task — CCI cohort counts', 'test_delete_task_casey_cci', 'task', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_034', 'grant_update', 'test_delete_R01 specific aims draft started', 'test_delete_grant_r01_ml_icu', 'grant', 'nick', datetime('now','-15 days')),
  ('test_delete_act_035', 'idea_create', 'test_delete_Submitted idea — Gender differences P/F', 'test_delete_idea_gender_pf', 'idea', 'mceachron', datetime('now','-7 days')),
  ('test_delete_act_036', 'milestone_create', 'test_delete_Added milestone — Coauthor 2 manuscripts', 'test_delete_mm_eddington_3', 'milestone', 'nick', datetime('now','-30 days')),
  ('test_delete_act_037', 'idea_vote', 'test_delete_Voted on REDCap audit', 'test_delete_idea_redcap_audit', 'idea', 'eddington', datetime('now','-55 days')),
  ('test_delete_act_038', 'decision_log', 'test_delete_Logged decision — Consolidate CLIF IRBs', 'test_delete_dec_irb_consolidation', 'decision', 'eddington', datetime('now','-50 days')),
  ('test_delete_act_039', 'task_update', 'test_delete_Started K23 aims draft', 'test_delete_task_kendall_aims', 'task', 'mceachron', datetime('now','-4 days')),
  ('test_delete_act_040', 'regulatory', 'test_delete_LTVV DUA renewal noted', 'test_delete_reg_ltvv_dua', 'regulatory', 'bromley', datetime('now','-20 days')),
  ('test_delete_act_041', 'idea_create', 'test_delete_Submitted idea — ATS workshop proposal', 'test_delete_idea_ats_workshop', 'idea', 'nick', datetime('now','-45 days')),
  ('test_delete_act_042', 'decision_log', 'test_delete_Logged decision — Move to biweekly lab meetings', 'test_delete_dec_meeting_cadence', 'decision', 'nick', datetime('now','-70 days')),
  ('test_delete_act_043', 'task_update', 'test_delete_Analysis re-run scheduled', 'test_delete_task_dan_analysis', 'task', 'shyu', datetime('now','-25 days')),
  ('test_delete_act_044', 'milestone_create', 'test_delete_Added milestone — First-author IHCA paper', 'test_delete_mm_mceachron_1', 'milestone', 'nick', datetime('now','-20 days')),
  ('test_delete_act_045', 'grant_update', 'test_delete_K23 budget worksheet drafted', 'test_delete_grant_k23_ihca', 'grant', 'mceachron', datetime('now','-30 days'));
