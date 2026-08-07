BEGIN;

CREATE UNIQUE INDEX one_active_annual_cycle_per_portfolio
  ON workflow_cases (portfolio_id)
  WHERE workflow_type = 'annual_cycle' AND status = 'active';

CREATE UNIQUE INDEX one_annual_cycle_per_portfolio_year
  ON workflow_cases (portfolio_id, business_year)
  WHERE workflow_type = 'annual_cycle';

COMMIT;
