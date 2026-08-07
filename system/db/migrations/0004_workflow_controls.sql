BEGIN;

ALTER TABLE approval_rounds
  ADD COLUMN proposed_action text NOT NULL,
  ADD COLUMN proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN opened_by uuid NOT NULL REFERENCES users(id);

CREATE UNIQUE INDEX one_open_approval_round_per_case
  ON approval_rounds (workflow_case_id)
  WHERE status = 'open';

CREATE UNIQUE INDEX one_active_annual_cycle_per_portfolio_year
  ON workflow_cases (portfolio_id, business_year)
  WHERE workflow_type = 'annual_cycle' AND status NOT IN ('closed', 'cancelled');

ALTER TABLE workflow_cases
  ADD COLUMN closed_at timestamptz;

COMMIT;
