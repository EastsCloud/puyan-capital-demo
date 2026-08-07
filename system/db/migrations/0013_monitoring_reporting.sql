BEGIN;

CREATE TABLE equity_value_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  position_snapshot_id uuid NOT NULL REFERENCES position_snapshots(id),
  business_date date NOT NULL,
  market_value numeric(24,8) NOT NULL CHECK (market_value >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, business_date)
);

CREATE TABLE rebalance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  position_snapshot_id uuid NOT NULL REFERENCES position_snapshots(id),
  check_date date NOT NULL,
  check_frequency text NOT NULL CHECK (check_frequency = 'monthly'),
  corridor_lower_relative numeric(12,8) NOT NULL,
  corridor_upper_relative numeric(12,8) NOT NULL,
  results jsonb NOT NULL,
  triggered boolean NOT NULL,
  checked_by uuid NOT NULL REFERENCES users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_case_id, check_date)
);

CREATE TABLE rebalance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rebalance_check_id uuid NOT NULL REFERENCES rebalance_checks(id) ON DELETE CASCADE,
  option_key text NOT NULL,
  label text NOT NULL,
  orders jsonb NOT NULL,
  expected_results jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'completed', 'overdue', 'cancelled')),
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  completion_due_date date,
  completed_at timestamptz,
  UNIQUE (rebalance_check_id, option_key)
);

CREATE UNIQUE INDEX one_accepted_rebalance_plan_per_check
  ON rebalance_plans (rebalance_check_id)
  WHERE status IN ('accepted', 'completed', 'overdue');

CREATE TABLE non_equity_nav_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  version integer NOT NULL CHECK (version > 0),
  as_of_date date NOT NULL,
  bond_nav numeric(24,8) NOT NULL CHECK (bond_nav >= 0),
  alternative_nav numeric(24,8) NOT NULL CHECK (alternative_nav >= 0),
  cash_nav numeric(24,8) NOT NULL CHECK (cash_nav >= 0),
  status text NOT NULL CHECK (status IN ('submitted', 'approved', 'rejected')),
  source_note text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (workflow_case_id, version)
);

CREATE TABLE report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  version integer NOT NULL CHECK (version > 0),
  as_of_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  report_data jsonb NOT NULL,
  generated_by uuid NOT NULL REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (workflow_case_id, version)
);

COMMIT;
