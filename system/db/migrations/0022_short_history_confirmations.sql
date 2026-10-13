BEGIN;
CREATE TABLE backtest_history_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  -- Snapshot identities intentionally survive a demo workflow reset, like audit evidence.
  workflow_case_id uuid NOT NULL,
  proposed_portfolio_version_id uuid NOT NULL,
  confirmed_by uuid NOT NULL REFERENCES users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  coverage_fingerprint text NOT NULL CHECK (length(coverage_fingerprint) = 64),
  warning_text text NOT NULL,
  history_snapshot jsonb NOT NULL,
  consent_version text NOT NULL DEFAULT 'short-history-v1'
);
CREATE INDEX backtest_history_confirmations_org_time ON backtest_history_confirmations (organization_id, confirmed_at DESC);
CREATE FUNCTION prevent_history_confirmation_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Short-history confirmations are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER backtest_history_confirmations_immutable BEFORE UPDATE OR DELETE ON backtest_history_confirmations FOR EACH ROW EXECUTE FUNCTION prevent_history_confirmation_mutation();
ALTER TABLE backtest_runs ADD COLUMN history_mode text NOT NULL DEFAULT 'standard' CHECK (history_mode IN ('standard', 'confirmed_short_history'));
ALTER TABLE backtest_runs ADD COLUMN short_history_confirmation_id uuid REFERENCES backtest_history_confirmations(id);
ALTER TABLE backtest_runs ADD CONSTRAINT backtest_history_mode_confirmation CHECK ((history_mode = 'standard' AND short_history_confirmation_id IS NULL) OR (history_mode = 'confirmed_short_history' AND short_history_confirmation_id IS NOT NULL));
COMMIT;
