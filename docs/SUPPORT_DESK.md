# Support center and restricted staff desk

## Setup

1. Apply **004_support_threads.sql** with `npm run db:migrate` before deploying this release. It adds revision/updated timestamps and the `support_messages` table. Migrations 001–003 must also be present.
2. All signed-in server accounts can open `/#support` or Account & security → View support requests & replies. The older browser-only guest mode cannot use real support accounts.
3. Staff access is **disabled by default**. An authorized operator can set server-only `SUPPORT_AGENT_IDS` to comma-separated `app_users.id` UUIDs in the intended Vercel environment. Do not use email addresses, wildcard values, profile fields, or VITE variables.
4. Each authorized staff account must verify its email through the implemented link flow. Accounts retain ordinary customer access until both conditions are met. Redeploy after changing environment settings, and test authorization with a separate ordinary account.
5. Staff mutations require current password confirmation on every request. This is password step-up, **not MFA**. Require secure staff devices, least privilege, and organizational controls; full MFA is still a launch prerequisite for sensitive operations.

## Behavior

- Customers can list only their own requests, read customer-visible replies, and add public replies. Supplying a different user ID or claiming a staff role grants no permissions.
- Staff can list recent tickets, read a conversation, reply publicly, add internal notes, and update status. The original subject/body are not editable via these APIs.
- Public staff replies set `waiting`; customer replies reopen to `open`. Internal notes preserve status. Staff can explicitly select `open`, `in_progress`, `waiting`, `resolved` or `closed`.
- Ticket mutations check a revision and atomically update the ticket, insert the message if applicable, and append a minimal audit event. Stale writes return 409 and do not post duplicate messages. The UI retains the unsent draft on failure; copy it before explicitly refreshing.
- Internal notes never appear in customer thread reads or account exports. Public messages and the original ticket are included in the owner's export (bounded to the most recent 1,000 messages). Deleting the customer account deletes their tickets and all notes. Deleting an agent retains the notes with a null actor ID and a staff role label.
- UI lists the 50 most recently updated requests and the latest 100 conversation messages. This is an initial bounded desk, not a full searchable ticketing system or archival export service.
- Messages render as plain text, never as HTML. Do not paste secrets or identity/financial documents.
- Replies are stored in the support center, **not automatically emailed**. The original request acknowledgment continues to use the existing optional email preference/outbox. This implementation does not staff the desk or promise response times.

## Operational limitations

No assignment/routing, attachments, full-text search, public webhooks, reply-email ingestion, or external helpdesk synchronization is implemented. Staff role configuration is server-controlled rather than a self-service role-management interface. Complete independent access review before inviting staff. Database owner credentials can bypass application authorization; use restricted runtime DB roles and protect migration access.
