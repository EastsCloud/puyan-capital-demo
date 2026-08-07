BEGIN;

CREATE TABLE external_data_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider_code text NOT NULL CHECK (provider_code IN ('eodhd')),
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  credential_ciphertext text,
  credential_iv text,
  credential_auth_tag text,
  credential_key_version integer NOT NULL DEFAULT 1 CHECK (credential_key_version > 0),
  token_last_four char(4),
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IN ('succeeded', 'failed')),
  last_test_message text,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_code),
  CHECK (
    (credential_ciphertext IS NULL AND credential_iv IS NULL AND credential_auth_tag IS NULL AND token_last_four IS NULL)
    OR
    (credential_ciphertext IS NOT NULL AND credential_iv IS NOT NULL AND credential_auth_tag IS NOT NULL AND token_last_four IS NOT NULL)
  )
);

CREATE INDEX external_data_connections_org_idx
  ON external_data_connections (organization_id, provider_code);

COMMIT;
