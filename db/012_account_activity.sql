-- Read-only projection of durable records, never inferred payments or returns.
CREATE OR REPLACE VIEW customer_activity_events AS
 WITH owned AS (
 SELECT acc.user_id,e.journal_id,e.asset,(-sum(e.units))::text AS units,a.decimals
 FROM ledger_entries e JOIN ledger_accounts acc ON acc.id=e.account_id JOIN ledger_assets a ON a.code=e.asset
 WHERE acc.kind='customer_liability' GROUP BY acc.user_id,e.journal_id,e.asset,a.decimals
 )
 SELECT 'journal:'||j.id::text AS id,o.user_id,j.created_at,'accounting'::text AS kind,
 CASE WHEN j.reverses IS NULL THEN 'Accounting entry posted' ELSE 'Reversal entry posted' END AS title,
 'Posted accounting change; not independent proof of settlement.'::text AS description,
 j.id::text AS reference,'activity'::text AS destination,
 jsonb_agg(jsonb_build_object('asset',o.asset,'units',o.units,'decimals',o.decimals) ORDER BY o.asset) AS amounts
 FROM ledger_journals j JOIN owned o ON o.journal_id=j.id GROUP BY j.id,o.user_id,j.created_at,j.reverses
 UNION ALL
 SELECT 'withdrawal:'||w.id::text,w.user_id,w.created_at,'withdrawal_requested','Withdrawal requested',
 'Funds reserved for review. No payment has been sent.',w.id::text,'withdrawals',
 jsonb_build_array(jsonb_build_object('asset',w.asset,'units',r.units::text,'decimals',a.decimals))
 FROM withdrawal_requests w JOIN fund_reservations r ON r.id=w.id JOIN ledger_assets a ON a.code=w.asset
 UNION ALL
 SELECT 'review:'||e.id::text,w.user_id,e.created_at,'withdrawal_'||e.decision,
 CASE e.decision WHEN 'approved' THEN 'Withdrawal approved' WHEN 'rejected' THEN 'Withdrawal rejected' ELSE 'Withdrawal under review' END,
 CASE e.decision WHEN 'approved' THEN 'Funds remain reserved. Approval is not payment.' WHEN 'rejected' THEN 'Request rejected and reserved funds released.' ELSE 'An administrator is reviewing your request.' END,
 w.id::text,'withdrawals','[]'::jsonb
 FROM admin_review_events e JOIN withdrawal_requests w ON w.id=e.reservation_id
 UNION ALL
 SELECT 'cancelled:'||w.id::text,w.user_id,e.created_at,'withdrawal_cancelled','Withdrawal cancelled',
 'Request cancelled and reserved funds released.',w.id::text,'withdrawals','[]'::jsonb
 FROM withdrawal_requests w JOIN fund_reservation_events e ON e.reservation_id=w.id
 WHERE e.state='released' AND e.reason='Customer cancelled withdrawal';
CREATE TABLE IF NOT EXISTS account_notification_reads (
 user_id uuid NOT NULL REFERENCES app_users(id),
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 100),
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,event_id)
);
REVOKE ALL ON customer_activity_events,account_notification_reads FROM PUBLIC;
