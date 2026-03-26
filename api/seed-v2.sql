-- Seed meetings + action_items from existing static data
-- Run: npx wrangler d1 execute mnccore-lab --remote --file=api/seed-v2.sql

INSERT OR REPLACE INTO meetings (id, date, title, type, attendees, agenda, notes, decisions, status) VALUES
('mtg-2026-03-25', '2026-03-25', 'MNCCORE Biweekly: CLIF Manuscript Updates & GDMS Survey Launch', 'biweekly',
 '["nick","nate","eddington","bromley","mceachron","shyu"]',
 '["PF-v-SF manuscript revision status (reviewer comments received)","VentMode Waterfall JAMIA submission update","GDMS survey distribution timeline","CCI in ARDS analysis plan review","Lab meeting schedule for April"]',
 'Nick shared reviewer comments from PF-v-SF submission. Overall positive tone. Main concern is sensitivity analysis approach. Nate presented preliminary CCI trajectory clusters — 3-class model fits best. Team agreed to target April 15 for CCI analysis completion.',
 '["Will use 2-stage sensitivity analysis for PF-v-SF revision per reviewer request","GDMS survey goes to all UMN ICU attendings first, then expand to CLIF sites"]',
 'completed'),

('mtg-2026-03-11', '2026-03-11', 'MNCCORE Biweekly: LPV Paper Proofs & IV Fluids Analysis', 'biweekly',
 '["nick","nate","eddington","bromley","safadi","chipman"]',
 '["LPV adherence paper — galley proofs review","IV Fluids shortage analysis: preliminary results","Volume vs Pressure Control study design","Research coordinator hiring update"]',
 'Casey presented IV fluids analysis — clear pre/post signal in crystalloid volumes. Jeff Chipman raised concern about surgical ICU vs medical ICU confounding. Added stratified analysis to plan. Sami reviewed LPV galley proofs and caught two figure label errors.',
 '["Volume vs Pressure Control study will use propensity score matching (not IV regression)","Post LPV paper to lab Twitter/X account after publication"]',
 'completed'),

('mtg-2026-02-25', '2026-02-25', 'MNCCORE Biweekly: P1 Gender Disparities & Quality Metrics', 'biweekly',
 '["nick","nate","eddington","mceachron","fitzgerald"]',
 '["P1 Gender Disparities analysis update","ICU Quality Metrics data extraction progress","DNR Provider Variation manuscript outline","Fellow research project updates (Shyu, Fitzgerald)"]',
 'Kendall McEachron presented literature review on gender differences in mechanical ventilation. Beret Fitzgerald shared early results from her cardiac arrest project. Team agreed on IBW recalculation approach for P1 after reviewing Amato et al. methodology.',
 '["Gender disparities paper will include height-based IBW recalculation as primary analysis","Quality metrics dashboard will use Quarto + R Shiny for internal use"]',
 'completed'),

('mtg-2026-02-11', '2026-02-11', 'MNCCORE Biweekly: CLIF Data Pulls & Grant Planning', 'biweekly',
 '["nick","nate","eddington","bromley","dudley"]',
 '["CLIF v3 data availability update","Hypothermia rewarming rates study protocol","Provider EBP R01 concept development","Spring research day abstract submissions"]',
 'Adams Dudley joined to discuss R01 strategy for Provider EBP program. Recommended framing around implementation science rather than pure outcomes. Emma confirmed 4 abstracts ready for Research Day submission. CLIF v3 temperature data confirmed available at 8 sites.',
 '["Will use CLIF v3 temperature tables (not v2) for hypothermia study","Provider EBP R01 will target October 2026 cycle"]',
 'completed'),

('mtg-2026-01-28', '2026-01-28', 'MNCCORE Biweekly: New Year Planning & WBC/Sepsis Kickoff', 'biweekly',
 '["nick","nate","eddington","bromley","mceachron","shyu","arriaza"]',
 '["2026 research priorities and timeline","WBC & Temperature Thresholds study design","FLAME study enrollment update","New research coordinator onboarding (Steven Arriaza)","Lab publication goals for 2026"]',
 'Kickoff meeting for 2026. Reviewed 2025 accomplishments (5 papers published, 2 grants submitted). Set ambitious but realistic targets. Welcomed Steven Arriaza as new research coordinator. Dan Shyu will focus on sepsis definitions project for his fellowship research.',
 '["Lab target: 6 manuscripts submitted in 2026 (3 CLIF, 2 lab, 1 Nate)","Will onboard Steven Arriaza to GDMS survey coordination first","FLAME enrollment paused until site IRB renewals complete"]',
 'completed');

-- Seed action items
INSERT OR REPLACE INTO action_items (id, meeting_id, project_id, description, assignee, due_date, completed) VALUES
-- Meeting 2026-03-25
('ai-1', 'mtg-2026-03-25', 'pf-v-sf-oxygenation-severity', 'Address PF-v-SF reviewer comment #3 re: sensitivity analysis', 'nick', '2026-04-01', 0),
('ai-2', 'mtg-2026-03-25', NULL, 'Finalize GDMS survey REDCap instrument and test distribution', 'bromley', '2026-03-31', 0),
('ai-3', 'mtg-2026-03-25', NULL, 'Pull updated CCI cohort counts from CLIF tables', 'eddington', '2026-04-04', 0),
-- Meeting 2026-03-11
('ai-4', 'mtg-2026-03-11', NULL, 'Submit galley proof corrections for LPV adherence paper', 'nick', '2026-03-14', 1),
('ai-5', 'mtg-2026-03-11', 'iv-fluids-shortage', 'Generate IV fluids pre/post shortage comparison tables', 'eddington', '2026-03-20', 1),
('ai-6', 'mtg-2026-03-11', 'volume-vs-pressure-control-mortality', 'Draft Volume vs Pressure Control statistical analysis plan', 'nick', '2026-03-25', 0),
-- Meeting 2026-02-25
('ai-7', 'mtg-2026-02-25', 'p1-gender-disparities-low-tidal-volume', 'Complete gender disparities subgroup analysis by BMI category', 'eddington', '2026-03-07', 1),
('ai-8', 'mtg-2026-02-25', NULL, 'Circulate DNR manuscript outline for team feedback', 'nate', '2026-03-04', 1),
('ai-9', 'mtg-2026-02-25', 'p4-icu-quality-metrics', 'Set up quality metrics dashboard prototype in R Shiny', 'eddington', '2026-03-14', 1),
-- Meeting 2026-02-11
('ai-10', 'mtg-2026-02-11', 'hypothermia-rewarming-rates', 'Submit CLIF data request for hypothermia temperature records', 'nick', '2026-02-18', 1),
('ai-11', 'mtg-2026-02-11', NULL, 'Draft Provider EBP specific aims page for Adams review', 'nick', '2026-02-28', 1),
('ai-12', 'mtg-2026-02-11', NULL, 'Compile list of UMN Research Day abstract deadlines', 'bromley', '2026-02-14', 1),
-- Meeting 2026-01-28
('ai-13', 'mtg-2026-01-28', 'wbc-temperature-thresholds-for-sepsis', 'Develop WBC threshold analysis protocol with Sepsis-3 criteria mapping', 'nick', '2026-02-14', 1),
('ai-14', 'mtg-2026-01-28', NULL, 'Complete onboarding checklist and CITI training', 'arriaza', '2026-02-07', 1),
('ai-15', 'mtg-2026-01-28', NULL, 'Create shared project tracker for 2026 milestones', 'bromley', '2026-02-04', 1);
