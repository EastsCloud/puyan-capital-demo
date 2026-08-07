BEGIN;

ALTER TABLE audit_events ALTER COLUMN request_id TYPE text USING request_id::text;

COMMIT;
