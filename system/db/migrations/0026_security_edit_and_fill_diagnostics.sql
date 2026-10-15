BEGIN;
ALTER TABLE ticker_universe ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ticker_universe ADD COLUMN supersedes_id uuid REFERENCES ticker_universe(id);
ALTER TABLE ticker_universe ADD COLUMN trading_lot_size integer CHECK(trading_lot_size BETWEEN 1 AND 1000000);
CREATE UNIQUE INDEX security_override_source ON ticker_universe(organization_id,supersedes_id) WHERE supersedes_id IS NOT NULL;
-- Known domestic Japanese common stock. Other instruments require explicit verification.
UPDATE ticker_universe SET trading_lot_size=100 WHERE ticker='6861' AND exchange_code='TSE' AND market='JP';
CREATE VIEW organization_security_catalog AS
 SELECT o.id AS catalog_organization_id,t.* FROM organizations o CROSS JOIN ticker_universe t
 WHERE (t.organization_id IS NULL OR t.organization_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM ticker_universe x WHERE x.supersedes_id=t.id AND x.organization_id=o.id);
CREATE TABLE security_identity_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 old_ticker text NOT NULL,old_exchange text NOT NULL,new_ticker text NOT NULL,new_exchange text NOT NULL,
 market text NOT NULL,reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(old_ticker=new_ticker),CHECK(old_exchange<>new_exchange),UNIQUE(organization_id,old_ticker,old_exchange)
);
ALTER TABLE execution_fill_lines ADD COLUMN reconciliation_detail jsonb;
ALTER TABLE execution_fill_batches ADD COLUMN review_note text;
COMMIT;
