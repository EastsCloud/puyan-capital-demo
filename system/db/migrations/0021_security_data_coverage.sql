BEGIN;
-- Preserve every existing security and portfolio; coverage is evidence, not approval.
ALTER TABLE ticker_universe ADD COLUMN data_coverage jsonb;
COMMIT;
