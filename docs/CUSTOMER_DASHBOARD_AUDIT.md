# Customer dashboard and settings audit

Scope: code review of the customer route, account APIs and active browser suites on PR #6. This is not a penetration test, compliance certification, external-provider availability check or confirmation of production deployment.

## Dashboard inventory

| Area | Implemented | Missing / boundary |
| --- | --- | --- |
| Account access | Server session restoration, registration, login, recovery and email-link flows; authenticator challenge | Hosted email delivery and end-to-end provider configuration still need verification |
| Navigation | Header, desktop sidebar, mobile More menu, quick jump, support and profile links, full footer | Dashboard section deep links, refresh and back navigation are now implemented; Settings sub-tabs are not deep-linked. Unsaved SPA navigation protection is limited to guarded dashboard/settings controls |
| Account value / cash | Authenticated owner-scoped read-only ledger balances; exact integer formatting; $0.00 for confirmed empty account; errors stay unavailable; retry control; persisted browser balance privacy | USD total only when balances can be valued without invented conversion; not available-to-spend purchasing power or a brokerage valuation |
| Portfolio / top holdings / allocation | Owner-scoped exact ledger asset/network balances and honest empty states; asset listings do not become customer holdings | Brokerage/custody positions, pricing, allocation and valuation reconciliation still need integration; no investment execution |
| Charts | Existing layout, time ranges and analytics modes, with empty states | No account NAV/performance, contribution or income time series yet; no manufactured returns or flat-line history |
| Stocks, ETFs, bond funds | Searchable instrument identity directory, local issuer logos and opt-in external TradingView charts | Directory is curated, not a complete provider catalogue; inline quotes, corporate actions, market-data licensing review and execution are not connected. External charts may be delayed or unavailable |
| Crypto | Existing CoinPaprika catalogue, search/filter, quotes/details/history and browser watchlist restored | Provider availability/rate limits/data rights must be validated; browsing does not enable trading; watchlist is not synchronized across devices |
| Funding | Separate customer page, history boundary, production credential detection, blocked invoice creation | Production payment lifecycle, verified callback/refetch/settlement reconciliation, financial event delivery and operational release gates remain incomplete |
| Activity | Owner-scoped journal activity, cursor pagination, reversal labels, refresh/retry and export of loaded entries | Provider settlement statuses, complete financial/tax statements and reconciliation UI are not implemented; loaded-entry export is explicitly not a complete financial statement |
| Yield / auto-invest | Navigation and explicit unavailable states | No verified yield product, income events, recurring investment scheduler or execution provider |
| Goals / insights | Navigation and explicit unavailable states | No server-backed goal planning or analytical engine; no fabricated scores or progress |
| Trade / swap / sell / withdraw | Unsupported money actions remain disabled | Execution, withdrawals/returns, limits, approvals and reconciliation still require implementation |
| Header notifications | Empty inbox, not invented alerts | Durable in-app account/financial notification stream and read-state persistence are not implemented |
| Support | Real customer support threads and replies; staff access tested separately | Staffing, response expectations and production notification delivery remain operational tasks |
| Footer / readability | Account/explore/support navigation; increased type sizes; light/dark responsive styles | Full accessibility audit, assistive-technology testing, language/localization and all browser/zoom combinations remain unverified |

## Settings rebuilt in this update

### Personal profile
- Dedicated identity and email-verification panel; no fake avatar-upload control.
- Editable name, country and risk preference backed by the existing account API. Existing planning fields are preserved; no new default monthly contribution is inserted by Settings.
- Email is not silently editable; address changes currently require support. Risk preference is not an order or allocation change.
- Changed/unchanged save states, useful success/error notices and unsaved-profile discard protection. Browser refresh warns about unsaved profile/email edits.

### Security
- Email and authenticator status; existing local QR enrollment and recovery-code workflow preserved.
- Password change requires matching new-password confirmation before any API request. Submitted password fields are cleared after completion/failure. Successful change signs out all sessions.
- New authenticated `security-overview` account action returns only the caller's active sessions (up to 20) and recorded security events (up to 50). Session tokens/hashes and other users' records are not returned. Timestamps are real; device names, IP geolocation and last-activity times are not fabricated.
- Loading/error/retry states, current-session label and existing sign-out-all control. Individual session revocation is now implemented with owner-scoped opaque management IDs, confirmation and immediate session invalidation. Named device inventory is not implemented.

### Notifications
- Real optional sign-in/support email preferences with save feedback, load error/retry, delivery-configuration state and email history.
- Transactional security notices remain distinct from optional preferences. Provider acceptance is not represented as inbox delivery.
- Settings-tab changes and manual refresh protect unsaved email preference edits. No specimen email or fake notification control is published.

### Appearance
- Working Light, Dark and Use device setting choices synchronized with the global theme control in the same tab.
- Working balance-privacy toggle synchronized with the dashboard header and saved per account in this browser. Only display preferences/watchlist items are stored locally, not financial balances.

### Data & privacy
- Existing authenticated account export, clearly described as account/support/security data, with any archived simulation snapshot explicitly historical. Not a financial or tax statement.
- Deletion isolated behind a review disclosure, exact email confirmation, current password and final confirmation. Server authorization still controls eligibility.
- Foreign-key retention conflicts now return HTTP 409 with account-closure/support guidance; existing ledger records are not deleted or modified to force account deletion.
- No false KYC, address, payout destination, tax-document, consent or email-change controls without backing services.

## Recommended next implementation order

1. Verify the deployed version, correct Neon database and live operational protections (roles, backups, monitoring, email sender). This audit itself performs no hosted writes.
2. Complete the production payment lifecycle and independent settlement reconciliation before opening deposits. Verify provider/business eligibility and return-of-funds procedures.
3. Accounting activity and asset-balance detail APIs are now implemented. Next: real positions/valuation/performance and settlement-status integration. Keep accounting, available funds and market valuations distinct.
4. Build financial notifications and operator exception/reconciliation workflows.
5. Implement server-backed goals/recurring execution/insights only against confirmed product requirements and approved providers; never reactivate the old simulation engine.
6. Finish secure self-service email changes, Settings-sub-tab deep links, complete account-data export/retention workflows and cross-device preferences as separate reviewed features.

## Validation

Local PGlite/API tests cover session isolation, no token disclosure and retention-safe deletion conflicts. Browser suites mock HTTP and exercise profile saving, verification requests, unsaved edits, password mismatch rejection, session retry, email preference save, theme/visibility changes, deletion safeguards, balance retry, MFA and 320–1440px layouts in both themes. They do not send live email, test actual provider uptime, move funds or certify financial readiness.

No new migration is required for this Settings rebuild. No production environment variables were changed, no funds were moved and no deployment was performed as part of the audit.

## Additional gap fixes after the Settings rebuild

- `GET /api/balances?view=activity` returns up to 30 posted journals per page, with a stable journal cursor, exact signed atomic-unit changes, asset/network identifiers and reversal labels. Only the caller's liability lines are included, even for journals split across customers. Internal posting keys, provider evidence and custody lines are never returned.
- Portfolio lists exact ledger asset balances without pretending these are brokerage positions or USD market valuations. Activity and overview now read real ledger history rather than a permanently empty placeholder. API errors are not represented as zero or an empty account.
- Loaded activity export is JSON and deliberately labeled partial when more entries exist. It is not a statement or proof of provider settlement. Balance privacy also masks activity amounts and disables this export while hidden.
- Selective session sign-out uses domain-separated one-way management IDs, never bearer tokens or stored token hashes. Unauthorized/cross-user selections fail; self-revocation clears the caller's cookie.
- Dashboard URLs use `#dashboard?section=...`; reload and browser Back restore the selected section. No new route can activate legacy simulations.
- Stock/fund directory entries open explicitly mapped external charts only after user consent. No sample price history is substituted on provider failure. Chart availability is not verified by the local tests.
- Additional tests cover cursor pagination, inaccessible cursors, split-journal ownership, exact amount display, individual session revocation, browser reload/back, activity export and unavailable chart handling.

These changes require no new database migration beyond the already-required ledger migration 007. Trading, deposits, yields, recurring execution, goals, portfolio insights, account-performance charts, durable in-app notifications and secure self-service email changes remain unimplemented, not "fixed" by a UI label. Provider/compliance and operating requirements remain outstanding.

## Internal funds safety follow-up

Migration 008 now adds append-only owner/asset-bound fund reservations, held/unreserved balance breakdowns and atomic accounting debit finalization. Customer ledger debits cannot bypass those reservations. The migration runner publishes all numbered scripts atomically to avoid temporarily restoring older guards. See `FUND_RESERVATIONS.md`. Unlike the earlier UI changes, this follow-up DOES require a new migration, which must be applied before this version of the balance API is deployed.

These are internal accounting primitives only. Customer/admin withdrawal and order request controllers, encrypted payout destinations, actual external execution and independent completion verification remain unimplemented and disabled. No provider configuration has been changed.
