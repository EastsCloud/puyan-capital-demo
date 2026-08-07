BEGIN;

CREATE TABLE report_benchmark_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  version integer NOT NULL CHECK (version > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  base_currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'incomplete')),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (workflow_case_id, version)
);

CREATE TABLE report_benchmark_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  benchmark_version_id uuid NOT NULL REFERENCES report_benchmark_versions(id) ON DELETE CASCADE,
  sleeve text NOT NULL CHECK (sleeve IN ('us', 'developedNonUs', 'emerging')),
  observation_date date NOT NULL,
  value numeric(24,10) NOT NULL CHECK (value > 0),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  UNIQUE (benchmark_version_id, sleeve, observation_date)
);

CREATE INDEX report_benchmark_observations_version_sleeve_date_idx
  ON report_benchmark_observations (benchmark_version_id, sleeve, observation_date);

COMMIT;
