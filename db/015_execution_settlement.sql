-- Trusted verifier staging only. Fill records are NOT yet posted balances.
CREATE TABLE IF NOT EXISTS execution_fills (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES execution_orders(id),
 provider text NOT NULL,
 provider_fill_ref text NOT NULL CHECK(length(provider_fill_ref) BETWEEN 1 AND 200),
 source_units numeric NOT NULL CHECK(source_units>0 AND source_units=trunc(source_units) AND source_units<1e78),
 fee_units numeric NOT NULL CHECK(fee_units>=0 AND fee_units=trunc(fee_units) AND fee_units<1e78),
 target_units numeric NOT NULL CHECK(target_units>0 AND target_units=trunc(target_units) AND target_units<1e78),
 evidence_ref text NOT NULL UNIQUE CHECK(length(evidence_ref) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_fill_ref),
 FOREIGN KEY(order_id,provider) REFERENCES execution_dispatches(order_id,provider)
);
CREATE TABLE IF NOT EXISTS execution_settlements (
 order_id uuid PRIMARY KEY REFERENCES execution_orders(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES ledger_journals(id),
 outcome text NOT NULL CHECK(outcome IN ('filled','cancelled_partial')),
 evidence_ref text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS execution_fills_immutable ON execution_fills;
CREATE TRIGGER execution_fills_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_fills FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS execution_settlements_immutable ON execution_settlements;
CREATE TRIGGER execution_settlements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_settlements FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION record_verified_execution_fill(p_id uuid,p_order uuid,p_provider text,p_ref text,p_source text,p_fee text,p_target text,p_evidence text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE q execution_quotes; prior execution_fills; total_source numeric; total_fee numeric;
BEGIN
 IF p_source IS NULL OR p_target IS NULL OR p_fee IS NULL OR p_source !~ '^[1-9][0-9]{0,77}$' OR p_target !~ '^[1-9][0-9]{0,77}$' OR p_fee !~ '^(0|[1-9][0-9]{0,77})$' THEN RAISE EXCEPTION 'Invalid fill units' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM fund_reservations r JOIN execution_orders o ON o.id=r.id WHERE o.id=p_order FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 SELECT quotes.* INTO q FROM execution_quotes quotes JOIN execution_orders o ON o.quote_id=quotes.id WHERE o.id=p_order;
 IF q.provider IS DISTINCT FROM p_provider OR NOT EXISTS(SELECT 1 FROM execution_dispatch_events WHERE order_id=p_order AND state='submitted') THEN RAISE EXCEPTION 'Acknowledged matching dispatch required' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM execution_fills WHERE provider=p_provider AND provider_fill_ref=p_ref;
 IF FOUND THEN
  IF prior.order_id IS DISTINCT FROM p_order OR prior.source_units<>p_source::numeric OR prior.fee_units<>p_fee::numeric OR prior.target_units<>p_target::numeric OR prior.evidence_ref IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'Conflicting fill replay' USING ERRCODE='22023'; END IF;
  RETURN prior.id;
 END IF;
 IF EXISTS(SELECT 1 FROM execution_settlements WHERE order_id=p_order) OR NOT EXISTS(SELECT 1 FROM fund_reservation_states WHERE id=p_order AND state='held') THEN RAISE EXCEPTION 'Order is closed' USING ERRCODE='40001'; END IF;
 SELECT coalesce(sum(source_units),0)+p_source::numeric,coalesce(sum(fee_units),0)+p_fee::numeric INTO total_source,total_fee FROM execution_fills WHERE order_id=p_order;
 IF total_source>q.source_units OR total_fee>q.fee_units THEN RAISE EXCEPTION 'Fill exceeds quoted source or fee limit' USING ERRCODE='22023'; END IF;
 INSERT INTO execution_fills VALUES(p_id,p_order,p_provider,p_ref,p_source::numeric,p_fee::numeric,p_target::numeric,p_evidence,now());
 RETURN p_id;
END; $$;
CREATE OR REPLACE FUNCTION settle_verified_execution(p_order uuid,p_outcome text,p_target_account uuid,p_source_custody uuid,p_target_custody uuid,p_fee_account uuid,p_evidence text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE q execution_quotes; owner_id uuid; r fund_reservations; existing execution_settlements; source_total numeric; fee_total numeric; target_total numeric; target_asset text; journal uuid; lines jsonb;
BEGIN
 SELECT f.* INTO r FROM fund_reservations f JOIN execution_orders o ON o.id=f.id WHERE o.id=p_order FOR UPDATE OF f;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 SELECT quotes.* INTO q FROM execution_quotes quotes JOIN execution_orders o ON o.quote_id=quotes.id WHERE o.id=p_order;
 IF q.operation='stock_buy' THEN RAISE EXCEPTION 'Securities custody mapping and settlement are not connected' USING ERRCODE='22023'; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN ('filled','cancelled_partial') THEN RAISE EXCEPTION 'Invalid settlement outcome' USING ERRCODE='22023'; END IF;
 SELECT asset INTO target_asset FROM ledger_accounts WHERE id=p_target_account AND user_id=r.user_id AND kind='customer_liability';
 IF target_asset IS NULL OR target_asset<>q.target_symbol OR target_asset=q.source_asset OR NOT EXISTS(SELECT 1 FROM ledger_assets WHERE code=target_asset AND decimals=q.target_decimals) THEN RAISE EXCEPTION 'Target asset/network/account mismatch' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p_source_custody AND kind='custody' AND user_id IS NULL AND asset=q.source_asset) OR NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p_target_custody AND kind='custody' AND user_id IS NULL AND asset=target_asset) OR NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p_fee_account AND kind='fee' AND user_id IS NULL AND asset=q.source_asset) THEN RAISE EXCEPTION 'Invalid business settlement accounts' USING ERRCODE='22023'; END IF;
 -- Stable order-row lock precedes deterministically ordered customer locks.
 PERFORM lock_customer_funds(id) FROM ledger_accounts WHERE id IN(r.account_id,p_target_account) ORDER BY id;
 SELECT sum(source_units),sum(fee_units),sum(target_units) INTO source_total,fee_total,target_total FROM execution_fills WHERE order_id=p_order;
 IF source_total IS NULL THEN RAISE EXCEPTION 'Verified fills required' USING ERRCODE='22023'; END IF;
 IF p_outcome='filled' AND target_total<q.target_units THEN RAISE EXCEPTION 'Receiving quantity below quote' USING ERRCODE='22023'; END IF;
 lines:=jsonb_build_array(
 jsonb_build_object('accountId',r.account_id,'asset',q.source_asset,'units',(source_total+fee_total)::text),
 jsonb_build_object('accountId',p_source_custody,'asset',q.source_asset,'units',(-source_total)::text),
 jsonb_build_object('accountId',p_target_custody,'asset',target_asset,'units',target_total::text),
 jsonb_build_object('accountId',p_target_account,'asset',target_asset,'units',(-target_total)::text));
 IF fee_total>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('accountId',p_fee_account,'asset',q.source_asset,'units',(-fee_total)::text)); END IF;
 SELECT * INTO existing FROM execution_settlements WHERE order_id=p_order;
 IF FOUND AND (existing.outcome IS DISTINCT FROM p_outcome OR existing.evidence_ref IS DISTINCT FROM p_evidence) THEN RAISE EXCEPTION 'Conflicting settlement replay' USING ERRCODE='22023'; END IF;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM fund_reservation_states WHERE id=p_order AND state='held') THEN RAISE EXCEPTION 'Order no longer held' USING ERRCODE='40001'; END IF;
 journal:=ledger_post(gen_random_uuid(),'execution-settlement:'||p_order::text,p_evidence,lines,NULL);
 IF existing.order_id IS NOT NULL THEN
  IF existing.journal_id<>journal THEN RAISE EXCEPTION 'Settlement replay mismatch' USING ERRCODE='22023'; END IF;
  RETURN journal;
 END IF;
 INSERT INTO execution_settlements VALUES(p_order,journal,p_outcome,p_evidence,now());
 PERFORM release_customer_funds(r.user_id,p_order,'Execution settled; unused reservation released');
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),r.user_id,'order.settled');
 RETURN journal;
END; $$;
REVOKE ALL ON execution_fills,execution_settlements FROM PUBLIC;
REVOKE ALL ON FUNCTION record_verified_execution_fill(uuid,uuid,text,text,text,text,text,text),settle_verified_execution(uuid,text,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
