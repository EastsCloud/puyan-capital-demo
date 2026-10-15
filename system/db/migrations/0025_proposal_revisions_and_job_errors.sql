BEGIN;
ALTER TABLE optimization_jobs ADD COLUMN error_detail jsonb;
ALTER TABLE proposed_portfolio_versions
  ADD COLUMN parent_version_id uuid REFERENCES proposed_portfolio_versions(id) ON DELETE SET NULL,
  ADD COLUMN change_summary jsonb;
CREATE INDEX proposal_parent_version ON proposed_portfolio_versions(parent_version_id);
COMMIT;
