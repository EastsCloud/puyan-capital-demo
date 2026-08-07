BEGIN;

ALTER TABLE data_source_catalog
  ADD COLUMN data_key text,
  ADD COLUMN license_note text;

UPDATE data_source_catalog
   SET data_key = CASE code
     WHEN 'us_equity_oecd_fred' THEN 'us_equity'
     WHEN 'jp_equity_oecd_fred' THEN 'japan_equity'
     WHEN 'cn_equity_oecd_fred' THEN 'china_equity'
     WHEN 'hk_equity_hkma' THEN 'hong_kong_equity'
     WHEN 'us_cpi_fred' THEN 'us_cpi'
     WHEN 'us_ten_year_fred' THEN 'us_ten_year_yield'
     WHEN 'us_tbill_fred' THEN 'us_tbill_yield'
     WHEN 'global_commodity_imf_fred' THEN 'global_commodity'
   END,
       license_note = 'Public source; retain source attribution.';

ALTER TABLE data_source_catalog
  ALTER COLUMN data_key SET NOT NULL;

INSERT INTO data_source_catalog
  (code, data_key, display_name, authority_name, authority_tier, category, adapter_key,
   series_key, public_url, default_priority, is_required, license_note)
VALUES
  ('hk_equity_nasdaq_fred', 'hong_kong_equity', '香港股票市场价格指数（长期后备）',
   'Nasdaq, Inc. / Federal Reserve Bank of St. Louis', 2, 'equity_market', 'fred_series',
   'NASDAQNQHK', 'https://fred.stlouisfed.org/series/NASDAQNQHK', 41, true,
   'Nasdaq copyrighted index data; internal analytical use only and subject to provider terms.'),
  ('hk_equity_tw_gov_monthly', 'hong_kong_equity', '恒生指数月末值（最新值校验）',
   'Bureau of Labor Funds, Ministry of Labor, Taiwan', 1, 'equity_market', 'taiwan_mol_monthly_indices',
   '中國-香港恆生指數', 'https://data.gov.tw/en/datasets/31899', 42, true,
   'Open Government Data License, version 1.0.');

INSERT INTO default_data_source_settings (version, settings, description)
SELECT 2,
       jsonb_object_agg(code, jsonb_build_object('enabled', true, 'priority', default_priority) ORDER BY default_priority),
       'Versioned official-source-first chains, including audited Hong Kong market fallbacks.'
  FROM data_source_catalog;

COMMIT;
