# AutoUploader server

The server owns scheduled jobs so the desktop can be offline at publication time.
Immediate jobs still run on the desktop.

## Deploy

1. Create a private Cloudflare R2 bucket and S3 API token.
2. Copy `apps/server/.env.example` to `apps/server/.env` and fill every secret.
3. Copy `.env.server.example` to the root `.env` and set `POSTGRES_PASSWORD`
   and `SERVER_DOMAIN`.
4. Point the domain to the VPS and run:

   ```sh
   docker compose -f docker-compose.server.yml up -d --build
   ```

5. Put the same public URL and API token into `apps/client/.env`:

   ```dotenv
   AUTOUPLOADER_SERVER_URL=https://upload.example.com
   AUTOUPLOADER_SERVER_TOKEN=the-same-server-api-token
   ```

The VPS should have at least 2 vCPU, 4 GB RAM, and 1 GB shared memory for browser
workers. Caddy obtains TLS certificates automatically. PostgreSQL is dumped daily,
and the `backup-sync` service copies dumps to `database-backups/` in R2.

## Security and operations

- Keep the R2 bucket private. Video parts are uploaded through one-hour signed URLs.
- `CREDENTIALS_MASTER_KEY` must decode to exactly 32 random bytes. Rotating it
  requires re-synchronizing accounts from the desktop.
- Set per-account residential/static proxies where required. A datacenter VPS IP can
  trigger TikTok or Instagram challenges.
- Successful video objects are removed after `VIDEO_RETENTION_HOURS`. Incomplete
  multipart uploads are aborted after `UPLOAD_RETENTION_HOURS`.
- A worker crash before platform submission returns a job to the queue. A crash after
  submission starts marks it `needs_review` to avoid duplicate publication.
- Expired sessions are marked `reauth_required`; reconnect the account on the desktop,
  then explicitly retry the job.

## Verification

```sh
pnpm --filter @autouploader/server typecheck
pnpm --filter @autouploader/server test
pnpm --filter @autouploader/server build
curl https://upload.example.com/health
```

After deployment, exercise authenticated API, PostgreSQL, and R2 together:

```sh
INTEGRATION_SERVER_URL=https://upload.example.com \
INTEGRATION_SERVER_TOKEN=your-token \
pnpm --filter @autouploader/server test
```
