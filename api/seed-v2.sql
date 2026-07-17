-- Seed meetings from existing static data
-- Run: bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/seed-v2.sql
--
-- DEPRECATES (backlog #742, 2026-07-16): this file is NOT wired to any
-- package.json script (the live seed path is `npm run seed` ->
-- scripts/seed-d1.ts / `npm run db:seed` -> scripts/seed.sql). It is
-- referenced only in comments of api/schema-v6.sql, api/schema-v97-
-- completed-at-repair.sql, and api/schema-v99-drop-action-items.sql as
-- historical context, never as an executable dependency. Recommend full
-- retirement (git rm) on next touch — flagged here, not removed
-- unilaterally per dispatch scope.

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

-- Seed action items — REMOVED (backlog #742, 2026-07-16): action_items was
-- DROPPED (api/schema-v99-drop-action-items.sql). The table's rows were
-- already backfilled into `tasks` (WHERE meeting_id IS NOT NULL) losslessly
-- by schema-v96-action-items-backfill.sql, so no replacement INSERT is
-- needed here — this static fixture data has no live path to reconstruct
-- from since v99 landed. The 15-row `INSERT OR REPLACE INTO action_items`
-- block previously here would error loud ("no such table: action_items")
-- if this file were manually re-run post-drop.
