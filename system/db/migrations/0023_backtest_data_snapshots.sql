BEGIN;
-- Temporary checked-price cache. Confirmation evidence copies its prices before expiry.
CREATE TABLE backtest_data_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id) ON DELETE CASCADE,
  proposed_portfolio_version_id uuid NOT NULL REFERENCES proposed_portfolio_versions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  business_fingerprint text NOT NULL CHECK (length(business_fingerprint) = 64),
  coverage_fingerprint text NOT NULL CHECK (length(coverage_fingerprint) = 64),
  snapshot_payload jsonb NOT NULL
);
CREATE INDEX backtest_data_snapshots_org_expiry ON backtest_data_snapshots (organization_id, expires_at);
-- No FK to the expiring cache: immutable evidence must outlive cache cleanup/reset.
ALTER TABLE backtest_history_confirmations ADD COLUMN data_snapshot_id uuid;
COMMIT;
