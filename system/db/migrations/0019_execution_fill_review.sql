BEGIN;

ALTER TABLE execution_fill_batches
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'approved', 'rejected')),
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz;

CREATE INDEX execution_fill_batches_review_idx
  ON execution_fill_batches (workflow_case_id, review_status, imported_at DESC);

COMMIT;
