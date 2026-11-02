BEGIN;
CREATE TABLE market_data_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),markets jsonb NOT NULL DEFAULT '["US","HK","SHG","SHE","TSE"]',
 auto_enabled boolean NOT NULL DEFAULT false,sync_hour_utc integer NOT NULL DEFAULT 8 CHECK(sync_hour_utc BETWEEN 0 AND 23),
 updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE market_data_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),requested_by uuid REFERENCES users(id),
 operation text NOT NULL CHECK(operation IN ('directory','prices')),business_date date NOT NULL,markets jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','partial','failed')),
 progress jsonb NOT NULL DEFAULT '[]',error_message text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 deadline_at timestamptz NOT NULL DEFAULT(now()+interval '10 minutes')
);
CREATE UNIQUE INDEX one_market_sync_per_operation ON market_data_jobs(organization_id,operation) WHERE status IN ('queued','running');
CREATE INDEX market_job_history ON market_data_jobs(organization_id,created_at DESC);
CREATE TABLE market_security_directory (
 organization_id uuid NOT NULL REFERENCES organizations(id),provider_exchange text NOT NULL,ticker text NOT NULL,
 name text NOT NULL,currency text,instrument_type text,listing_exchange text,isin text,
 source_url text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),job_id uuid NOT NULL REFERENCES market_data_jobs(id),
 PRIMARY KEY(organization_id,provider_exchange,ticker)
);
CREATE INDEX market_directory_search ON market_security_directory(organization_id,provider_exchange,ticker);
CREATE TABLE market_daily_prices (
 organization_id uuid NOT NULL REFERENCES organizations(id),provider_exchange text NOT NULL,ticker text NOT NULL,business_date date NOT NULL,
 close numeric NOT NULL CHECK(close>0),adjusted_close numeric,source_url text NOT NULL,
 retrieved_at timestamptz NOT NULL DEFAULT now(),job_id uuid NOT NULL REFERENCES market_data_jobs(id),
 PRIMARY KEY(organization_id,provider_exchange,ticker,business_date)
);
CREATE TABLE automatic_equity_valuations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),portfolio_id uuid NOT NULL REFERENCES portfolios(id),
 quantity_snapshot_id uuid NOT NULL REFERENCES position_snapshots(id),business_date date NOT NULL,
 status text NOT NULL CHECK(status IN ('ready','incomplete','applied')),total_value numeric,currency char(3) NOT NULL,
 evidence jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),applied_by uuid REFERENCES users(id),applied_at timestamptz,
 UNIQUE(portfolio_id,business_date)
);
COMMIT;
