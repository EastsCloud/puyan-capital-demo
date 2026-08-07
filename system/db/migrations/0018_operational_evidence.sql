BEGIN;

CREATE TABLE execution_fill_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  source_file_id uuid NOT NULL REFERENCES source_files(id),
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('matched', 'exceptions')),
  summary jsonb NOT NULL,
  imported_by uuid NOT NULL REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE execution_fill_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES execution_fill_batches(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  exchange_code text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity numeric(24,8) NOT NULL CHECK (quantity >= 0),
  price numeric(24,8) NOT NULL CHECK (price >= 0),
  trade_value numeric(24,8) NOT NULL CHECK (trade_value >= 0),
  external_trade_id text,
  planned_value numeric(24,8) NOT NULL CHECK (planned_value >= 0),
  variance_value numeric(24,8) NOT NULL,
  variance_rate numeric(16,10),
  reconciliation_status text NOT NULL CHECK (reconciliation_status IN ('matched', 'exception', 'unplanned'))
);

CREATE INDEX execution_fill_batches_workflow_idx
  ON execution_fill_batches (workflow_case_id, business_date DESC, imported_at DESC);

CREATE TABLE external_cash_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  flow_date date NOT NULL,
  amount numeric(24,8) NOT NULL CHECK (amount <> 0),
  currency char(3) NOT NULL,
  flow_type text NOT NULL CHECK (flow_type IN ('contribution', 'withdrawal')),
  reference text,
  note text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX external_cash_flows_workflow_idx
  ON external_cash_flows (workflow_case_id, flow_date, recorded_at);

CREATE TABLE report_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_version_id uuid NOT NULL REFERENCES report_versions(id),
  channel text NOT NULL CHECK (channel IN ('email', 'meeting', 'secure_link', 'other')),
  recipients text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'sent', 'acknowledged')),
  note text,
  distributed_by uuid NOT NULL REFERENCES users(id),
  distributed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX report_distributions_report_idx
  ON report_distributions (report_version_id, distributed_at DESC);

COMMIT;
