BEGIN;
CREATE TABLE optimization_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id) ON DELETE CASCADE,
  proposed_portfolio_version_id uuid NOT NULL REFERENCES proposed_portfolio_versions(id) ON DELETE CASCADE,
  backtest_run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','running','succeeded','no_candidate','failed','interrupted')),
  progress jsonb NOT NULL DEFAULT '{}',
  error_code text, message text,
  optimization_run_id uuid REFERENCES optimization_runs(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 seconds'), finished_at timestamptz
);
-- One active optimizer across the deployment, not one memory-heavy job per browser.
CREATE UNIQUE INDEX optimization_jobs_one_active ON optimization_jobs ((1)) WHERE status IN ('queued','preparing','running');
CREATE INDEX optimization_jobs_workflow_time ON optimization_jobs(workflow_case_id,created_at DESC);
COMMIT;
