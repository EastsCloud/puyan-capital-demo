BEGIN;

ALTER TABLE portfolios
  ADD COLUMN initial_principal numeric(24,2),
  ADD COLUMN principal_effective_at timestamptz,
  ADD COLUMN principal_set_by uuid REFERENCES users(id),
  ADD CONSTRAINT portfolios_positive_principal CHECK (initial_principal IS NULL OR initial_principal > 0);

COMMIT;
