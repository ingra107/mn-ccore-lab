Archived 2026-10-12 (s65 grants lane). The legacy `grants` table's bucket SQL and the `grant_milestones` routes.

Why: the Grants page reads grant products now (Nick 2026-10-12: "we can keep grants separate so use the current grants page to build out and make sure it reads the right stuff"). A grant's dates and money are products.period_start / period_end / amount_usd (schema-v128); a post-award milestone is a tasks row with kind='milestone' and that product_id. `grant_milestones` held 0 rows in prod on 2026-10-12; `grants` held 5, mapped onto products by the backfill script (dry run only).

Proof nothing reads these: after this commit `grep -rn "grant-bucket\|grant-milestones" api src` finds only this folder. The bucket rule lives in api/routes/grants.ts (GRANT_BUCKET_SQL, from stage data).

Still standing (phase 2, with Nick's go): the `grants`, `grant_milestones` and `nih_grants` tables. `milestones.grant_id REFERENCES grants(id)` must be dropped or rebuilt before `grants` can be.
