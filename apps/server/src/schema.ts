export const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS devices (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'instagram')),
    label text NOT NULL,
    credentials_encrypted text NOT NULL,
    proxy jsonb,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key text NOT NULL UNIQUE,
    provider_upload_id text NOT NULL,
    file_name text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    status text NOT NULL DEFAULT 'uploading',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  );

  CREATE TABLE IF NOT EXISTS videos (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id uuid NOT NULL REFERENCES uploads(id),
    object_key text NOT NULL,
    original_name text NOT NULL,
    title text,
    description text,
    privacy_status text NOT NULL DEFAULT 'private',
    created_at timestamptz NOT NULL DEFAULT now(),
    delete_after timestamptz
  );

  CREATE TABLE IF NOT EXISTS upload_batches (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, request_id)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id uuid PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts(id),
    video_id uuid NOT NULL REFERENCES videos(id),
    platform text NOT NULL,
    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    executed_by text NOT NULL DEFAULT 'server',
    execution_stage text,
    lease_owner text,
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS jobs_status_scheduled_idx
    ON jobs(status, scheduled_at);
  CREATE INDEX IF NOT EXISTS jobs_account_running_idx
    ON jobs(account_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_running_per_account_idx
    ON jobs(account_id) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS videos_cleanup_idx
    ON videos(delete_after);

  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  `,
];
