BEGIN;
ALTER TABLE investment_archives ADD COLUMN deleted_at timestamptz;
ALTER TABLE investment_archives ADD COLUMN deleted_by uuid REFERENCES users(id);
CREATE INDEX active_archive_list ON investment_archives(organization_id,created_at DESC) WHERE deleted_at IS NULL;
COMMIT;
