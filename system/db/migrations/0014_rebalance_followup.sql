BEGIN;

CREATE TABLE rebalance_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rebalance_plan_id uuid NOT NULL REFERENCES rebalance_plans(id),
  position_snapshot_id uuid NOT NULL REFERENCES position_snapshots(id),
  verification_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'overdue')),
  results jsonb NOT NULL,
  verified_by uuid NOT NULL REFERENCES users(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rebalance_plan_id, position_snapshot_id)
);

CREATE INDEX rebalance_followups_plan_time_idx
  ON rebalance_followups (rebalance_plan_id, verification_date DESC, verified_at DESC);

COMMIT;
