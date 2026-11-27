# Protected operations: readiness and expired-auth cleanup

These tools are implemented but **not configured, scheduled, or smoke-tested remotely** by this change. They do not replace Vercel monitoring, a database backup, a restore drill, independent security review, or a retention policy approved for your organization.

## Prerequisites

- Apply all numbered migrations, including 003 (account links) and 004 (support threads).
- Use the intended Neon database and Vercel environment. Prefer isolated preview databases.
- Generate an independent random operations secret locally, e.g. `openssl rand -hex 32`. Store it in your password manager and Vercel's server-only `OPS_SECRET` setting. Never put it into URLs, VITE variables, source control, chat, or screenshots. It must contain at least 32 characters.
- Leave `MAINTENANCE_WRITES_ENABLED=false` until the dry run has been reviewed. Staff IDs and operations secrets have separate purposes; a normal session is insufficient for operations calls.
- Redeploy to pick up configuration. Deployment Protection may additionally restrict Vercel preview URLs. Do not disable protection just to make an operations endpoint accessible.

## Readiness probe

Set `INVEMON_ORIGIN` and load `OPS_SECRET` into your shell from your own secret manager without echoing it. Then:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $OPS_SECRET" \
  "$INVEMON_ORIGIN/api/health"
```

Only GET is accepted. A missing operations configuration returns 503; missing/wrong bearer credentials return 401. A missing database setting returns 503. Unexpected DB query failures return a generic 500, not the connection string.

An authorized probe queries actual database metadata, returning whether required runtime tables and support revision/timestamp columns are present. An incomplete schema or invalid/missing production HTTPS origin returns 503. A ready response is 200. The response never returns credential values, emails, account balances or database contents. Configuration booleans do **not** establish delivery-provider health, DNS verification, staff membership correctness, data freshness or full schema integrity.

You can configure an uptime monitor supporting secret Authorization headers against the canonical origin. No external monitor, alert destination, or platform integration is automatically created here. Use Vercel's protected logs for failures; never log request bodies, cookies, link tokens, password inputs or bearer headers.

## Safe cleanup dry run

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $OPS_SECRET" \
  "$INVEMON_ORIGIN/api/maintenance"
```

GET always counts without deletion, even when writes are enabled. POST with `{}` is also dry-run. Counts are **capped at 1,000 rows per table**, not a total backlog estimate.

## Explicit cleanup

After review, set `MAINTENANCE_WRITES_ENABLED=true` in the intended Vercel environment, redeploy, and use:

```bash
curl --fail-with-body --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $OPS_SECRET" \
  -H 'Content-Type: application/json' \
  --data '{"execute":true}' \
  "$INVEMON_ORIGIN/api/maintenance"
```

Execution requires both a valid bearer secret and the explicit enable flag. It atomically deletes at most 1,000 **expired** rows each from `app_sessions`, `app_rate_limits`, and `account_action_tokens`, and adds a minimal audit event. Repeating cleans the next batch. Active credentials and all user accounts, tickets, messages, cloud workspaces, audit history and email history remain untouched. There is no generalized table name/cutoff input or arbitrary SQL interface.

There is no automatically enabled cleanup schedule. If an operator schedules this, store the secret in the scheduler, use HTTPS, keep retries bounded, and inspect 401/403/5xx failures. Setting up a recurring service can incur charges and needs an operational owner.

## Before public launch

- Configure Neon PITR/backups, record retention, restore into an isolated branch, and exercise login/export after restore. Record evidence without sensitive account contents. Code cannot confirm your provider plan or restore process.
- Configure Vercel error alerting and edge abuse protection; periodically review failed login/reset/support traffic without logging secrets.
- Approve retention rules for accounts, support conversations, security events and email history before implementing deletion jobs for those records.
- Complete privacy/terms and define support contact/response expectations. Avoid claims of licensed brokerage, custody or bank-level security.
