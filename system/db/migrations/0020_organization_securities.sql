BEGIN;

-- Keep existing shared securities and all portfolio history. New administrator
-- registrations belong only to the administrator's organization.
ALTER TABLE ticker_universe ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE ticker_universe DROP CONSTRAINT ticker_universe_ticker_exchange_code_key;
CREATE UNIQUE INDEX ticker_universe_shared_identity ON ticker_universe (ticker, exchange_code) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX ticker_universe_organization_identity ON ticker_universe (organization_id, ticker, exchange_code) WHERE organization_id IS NOT NULL;

COMMIT;
