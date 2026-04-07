-- v31: PB Sector — Evening tasks slot + relay messages
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v31.sql --remote

-- Add evening_task_ids column to daily_plans
ALTER TABLE daily_plans ADD COLUMN evening_task_ids TEXT;
