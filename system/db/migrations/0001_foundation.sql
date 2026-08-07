BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('system_admin', 'decision_committee', 'execution_team');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'locked', 'disabled');
CREATE TYPE supported_locale AS ENUM ('zh-CN', 'en');
CREATE TYPE approval_decision AS ENUM ('approve', 'reject', 'abstain');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_locale supported_locale NOT NULL DEFAULT 'zh-CN',
  timezone text NOT NULL DEFAULT 'Asia/Hong_Kong',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  username text NOT NULL,
  display_name text NOT NULL,
  email text,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'invited',
  locale supported_locale NOT NULL DEFAULT 'zh-CN',
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (organization_id, username)
);

CREATE UNIQUE INDEX users_email_per_org_idx
  ON users (organization_id, email)
  WHERE email IS NOT NULL;

CREATE TABLE security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username_attempted text,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed')),
  ip_address inet,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip_address inet,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_active_user_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE parameter_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'effective', 'retired')),
  effective_from timestamptz,
  parameters jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, version)
);

CREATE UNIQUE INDEX one_effective_parameter_set_per_org
  ON parameter_sets (organization_id)
  WHERE status = 'effective';

CREATE TABLE workflow_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  workflow_type text NOT NULL,
  business_year integer,
  status text NOT NULL,
  current_step text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approval_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  workflow_version integer NOT NULL,
  required_role user_role NOT NULL,
  quorum_numerator integer NOT NULL DEFAULT 2,
  quorum_denominator integer NOT NULL DEFAULT 3,
  status text NOT NULL CHECK (status IN ('open', 'approved', 'rejected', 'cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (workflow_case_id, workflow_version, required_role)
);

CREATE TABLE approval_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_round_id uuid NOT NULL REFERENCES approval_rounds(id),
  voter_id uuid NOT NULL REFERENCES users(id),
  decision approval_decision NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_round_id, voter_id)
);

CREATE TABLE maker_checker_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_case_id uuid NOT NULL REFERENCES workflow_cases(id),
  action_type text NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  status text NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected')),
  payload jsonb NOT NULL,
  CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
);

CREATE TABLE source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  original_filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 char(64) NOT NULL,
  business_date date,
  imported_by uuid NOT NULL REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  retain_until date NOT NULL
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL,
  title_key text NOT NULL,
  body_key text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_status text NOT NULL DEFAULT 'pending',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed')),
  request_id uuid,
  ip_address inet,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_org_time_idx ON audit_events (organization_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

COMMIT;
