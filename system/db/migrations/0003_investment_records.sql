BEGIN;

CREATE TABLE annual_data_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  version integer NOT NULL CHECK (version > 0),
  as_of_date date NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('bull', 'balanced', 'bear')),
  model_version text NOT NULL,
  source_manifest jsonb NOT NULL,
  recommendation jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (workflow_case_id, version)
);

CREATE TABLE target_return_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  version integer NOT NULL CHECK (version > 0),
  annual_data_package_id uuid NOT NULL REFERENCES annual_data_packages(id),
  operating_cost_rate numeric(12,8) NOT NULL,
  expected_cpi_rate numeric(12,8) NOT NULL,
  scenario_adjustment_rate numeric(12,8) NOT NULL,
  target_return_rate numeric(12,8) NOT NULL,
  calculation jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (workflow_case_id, version)
);

CREATE TABLE sleeve_target_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  target_return_version_id uuid NOT NULL REFERENCES target_return_versions(id),
  version integer NOT NULL CHECK (version > 0),
  targets jsonb NOT NULL,
  reconciliation_difference numeric(16,10) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_case_id, version),
  CHECK (abs(reconciliation_difference) <= 0.00000001)
);

CREATE TABLE proposed_portfolio_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  sleeve_target_version_id uuid NOT NULL REFERENCES sleeve_target_versions(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'backtest_failed', 'backtest_passed', 'approved', 'rejected')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (workflow_case_id, version)
);

CREATE TABLE proposed_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_portfolio_version_id uuid NOT NULL REFERENCES proposed_portfolio_versions(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  exchange_code text NOT NULL,
  market text NOT NULL CHECK (market IN ('US', 'JP', 'HK', 'CN_A')),
  sleeve text NOT NULL,
  style text NOT NULL,
  weight numeric(12,8) NOT NULL CHECK (weight > 0 AND weight <= 1),
  locked boolean NOT NULL DEFAULT false,
  UNIQUE (proposed_portfolio_version_id, ticker, exchange_code)
);

CREATE TABLE backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_portfolio_version_id uuid NOT NULL REFERENCES proposed_portfolio_versions(id),
  run_number integer NOT NULL CHECK (run_number > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  benchmark_manifest jsonb NOT NULL,
  data_manifest jsonb NOT NULL,
  metrics jsonb NOT NULL,
  hard_control_pass boolean NOT NULL,
  review_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL,
  run_by uuid NOT NULL REFERENCES users(id),
  run_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposed_portfolio_version_id, run_number),
  CHECK (end_date > start_date)
);

CREATE TABLE optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_portfolio_version_id uuid NOT NULL REFERENCES proposed_portfolio_versions(id),
  backtest_run_id uuid NOT NULL REFERENCES backtest_runs(id),
  run_number integer NOT NULL CHECK (run_number > 0),
  model_version text NOT NULL,
  constraints jsonb NOT NULL,
  candidates jsonb NOT NULL,
  selected_candidate_key text,
  selected_by uuid REFERENCES users(id),
  selected_at timestamptz,
  run_by uuid NOT NULL REFERENCES users(id),
  run_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposed_portfolio_version_id, run_number)
);

CREATE TABLE market_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instrument_key text NOT NULL,
  observation_date date NOT NULL,
  field text NOT NULL,
  value numeric(24,10) NOT NULL,
  currency char(3),
  source_name text NOT NULL,
  source_url text,
  retrieved_at timestamptz NOT NULL,
  source_checksum char(64),
  UNIQUE (instrument_key, observation_date, field, source_name)
);

CREATE TABLE position_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  business_date date NOT NULL,
  source_file_id uuid NOT NULL REFERENCES source_files(id),
  adapter_name text NOT NULL,
  adapter_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'validated', 'rejected', 'effective')),
  imported_by uuid NOT NULL REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, business_date, source_file_id)
);

CREATE TABLE position_snapshot_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_snapshot_id uuid NOT NULL REFERENCES position_snapshots(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  exchange_code text NOT NULL,
  quantity numeric(24,8) NOT NULL,
  market_price numeric(24,8) NOT NULL,
  market_value numeric(24,8) NOT NULL,
  currency char(3) NOT NULL,
  classification jsonb NOT NULL,
  UNIQUE (position_snapshot_id, ticker, exchange_code)
);

COMMIT;
