BEGIN;

CREATE TABLE data_source_catalog (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  authority_name text NOT NULL,
  authority_tier integer NOT NULL CHECK (authority_tier BETWEEN 1 AND 3),
  category text NOT NULL,
  adapter_key text NOT NULL,
  series_key text,
  public_url text NOT NULL,
  default_priority integer NOT NULL CHECK (default_priority > 0),
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO data_source_catalog
  (code, display_name, authority_name, authority_tier, category, adapter_key, series_key, public_url, default_priority)
VALUES
  ('us_equity_oecd_fred', '美国股票广义价格指数', 'OECD / Federal Reserve Bank of St. Louis', 1, 'equity_market', 'fred_series', 'SPASTT01USM661N', 'https://fred.stlouisfed.org/series/SPASTT01USM661N', 10),
  ('jp_equity_oecd_fred', '日本股票广义价格指数', 'OECD / Federal Reserve Bank of St. Louis', 1, 'equity_market', 'fred_series', 'SPASTT01JPM661N', 'https://fred.stlouisfed.org/series/SPASTT01JPM661N', 20),
  ('cn_equity_oecd_fred', '中国股票广义价格指数', 'OECD / Federal Reserve Bank of St. Louis', 1, 'equity_market', 'fred_series', 'SPASTT01CNM661N', 'https://fred.stlouisfed.org/series/SPASTT01CNM661N', 30),
  ('hk_equity_hkma', '恒生指数月末值', 'Hong Kong Monetary Authority', 1, 'equity_market', 'hkma_capital_market', 'eq_mkt_hs_index', 'https://apidocs.hkma.gov.hk/documentation/market-data-and-statistics/monthly-statistical-bulletin/financial/capital-market-statistics', 40),
  ('us_cpi_fred', '美国城市居民消费价格指数', 'U.S. Bureau of Labor Statistics / Federal Reserve Bank of St. Louis', 1, 'macro', 'fred_series', 'CPIAUCSL', 'https://fred.stlouisfed.org/series/CPIAUCSL', 50),
  ('us_ten_year_fred', '美国十年期国债收益率', 'Board of Governors of the Federal Reserve System / Federal Reserve Bank of St. Louis', 1, 'rates', 'fred_series', 'DGS10', 'https://fred.stlouisfed.org/series/DGS10', 60),
  ('us_tbill_fred', '美国三个月国库券收益率', 'Board of Governors of the Federal Reserve System / Federal Reserve Bank of St. Louis', 1, 'rates', 'fred_series', 'TB3MS', 'https://fred.stlouisfed.org/series/TB3MS', 70),
  ('global_commodity_imf_fred', '全球大宗商品价格指数', 'International Monetary Fund / Federal Reserve Bank of St. Louis', 1, 'alternative_market', 'fred_series', 'PALLFNFINDEXM', 'https://fred.stlouisfed.org/series/PALLFNFINDEXM', 80);

CREATE TABLE default_data_source_settings (
  version integer PRIMARY KEY CHECK (version > 0),
  settings jsonb NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO default_data_source_settings (version, settings, description)
SELECT 1,
       jsonb_object_agg(code, jsonb_build_object('enabled', true, 'priority', default_priority) ORDER BY default_priority),
       'Official-source-first defaults for the isater annual public-data engine.'
  FROM data_source_catalog;

CREATE TABLE data_source_setting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('effective', 'retired')),
  settings jsonb NOT NULL,
  change_summary text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_from timestamptz,
  UNIQUE (organization_id, version)
);

CREATE UNIQUE INDEX one_effective_data_source_setting_per_org
  ON data_source_setting_versions (organization_id)
  WHERE status = 'effective';

CREATE TABLE public_data_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  run_number integer NOT NULL CHECK (run_number > 0),
  scenario text NOT NULL CHECK (scenario IN ('bull', 'balanced', 'bear')),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  model_version text NOT NULL,
  source_setting_version integer NOT NULL,
  source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation jsonb,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workflow_case_id, run_number)
);

ALTER TABLE annual_data_packages
  ADD COLUMN public_data_run_id uuid REFERENCES public_data_runs(id);

CREATE UNIQUE INDEX annual_data_package_run_idx
  ON annual_data_packages (public_data_run_id)
  WHERE public_data_run_id IS NOT NULL;

COMMIT;
