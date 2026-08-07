BEGIN;

CREATE UNIQUE INDEX users_global_username_ci_idx ON users (lower(username));

COMMIT;
