# Vercel Hobby function-count fix

The production deployment of main commit 53de3fb succeeded in building the frontend but failed publishing outputs: `exceeded_serverless_functions_per_deployment` (Hobby allows 12). There were 14 API entrypoint files.

`api/[...path].mjs` is now the ONLY deployed API function. The 14 existing handler implementations live in `server/routes/`; helper modules remain under `server/`. The catch-all explicitly imports and allowlists each handler. Existing public URLs are unchanged, including `/api/account`, `/api/funding-ipn`, `/api/health`, `/api/admin`, `/api/withdrawals` and `/api/goals`. No client, webhook or operations URL changes are required.

The router derives dispatch from the URL pathname, never from client query/body role or route selectors. Original method, body, URL and headers pass through untouched; normal query parameters are parsed into req.query (duplicate keys become arrays). Unknown/nested/encoded nonmatching paths return no-store JSON 404. Each original handler continues enforcing its own auth, origins, roles, signature verification and rate limits. The function duration configuration remains 30 seconds. There is no new shared authorization bypass, new secret or financial feature flag change.

A regression test asserts there is exactly one API entrypoint and that all handlers are explicitly registered. Keep implementations OUTSIDE api/ to avoid creating more deployed functions. Public endpoint additions need an explicit import/registration and routing tests.

Local tests cover router dispatch, query confusion, request preservation, unknown routes and real consolidated entrypoint auth/method denials, plus all existing handler/API/database tests against the relocated handlers. Frontend build does not itself verify Vercel packaging; check the preview deployment after pushing.

This change needs no new database migration. The merged application's existing migrations through 011 and private configuration remain prerequisites for functional hosted account services. This fix does not enable deposits, withdrawals or payout execution. A successful preview/build is not evidence those services are configured or ready.
