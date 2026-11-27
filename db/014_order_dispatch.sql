-- Durable dispatch intent. Acknowledgement is NOT a fill or custody position.
CREATE TABLE IF NOT EXISTS execution_dispatches (
 order_id uuid PRIMARY KEY REFERENCES execution_orders(id),
 provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 80),
 execution_key uuid NOT NULL UNIQUE,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,provider),
 CHECK(execution_key=order_id)
);
CREATE TABLE IF NOT EXISTS execution_dispatch_events (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL,
 provider text NOT NULL,
 FOREIGN KEY(order_id,provider) REFERENCES execution_dispatches(order_id,provider),
 state text NOT NULL CHECK(state IN ('submitted','uncertain')),
 provider_order_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='submitted' AND provider_order_ref IS NOT NULL AND length(provider_order_ref) BETWEEN 1 AND 200) OR (state='uncertain' AND provider_order_ref IS NULL)),
 UNIQUE(order_id,state)
);
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_provider_reference ON execution_dispatch_events(provider,provider_order_ref) WHERE state='submitted';
DROP TRIGGER IF EXISTS execution_dispatches_immutable ON execution_dispatches;
CREATE TRIGGER execution_dispatches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_dispatches FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS execution_dispatch_events_immutable ON execution_dispatch_events;
CREATE TRIGGER execution_dispatch_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_dispatch_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION claim_execution_dispatch(p_order uuid,p_provider text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE q execution_quotes;
BEGIN
 PERFORM 1 FROM fund_reservations r JOIN execution_orders o ON o.id=r.id WHERE o.id=p_order FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 SELECT quotes.* INTO q FROM execution_quotes quotes JOIN execution_orders o ON o.quote_id=quotes.id WHERE o.id=p_order;
 IF q.provider IS DISTINCT FROM p_provider THEN RAISE EXCEPTION 'Execution provider mismatch' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM execution_dispatches WHERE order_id=p_order) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM execution_order_events WHERE order_id=p_order AND state='cancelled') OR NOT EXISTS(SELECT 1 FROM fund_reservation_states WHERE id=p_order AND state='held') THEN RAISE EXCEPTION 'Order no longer dispatchable' USING ERRCODE='40001'; END IF;
 IF q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Quote expired before dispatch' USING ERRCODE='22023'; END IF;
 INSERT INTO execution_dispatches(order_id,provider,execution_key) VALUES(p_order,p_provider,p_order);
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION record_execution_dispatch(p_id uuid,p_order uuid,p_provider text,p_state text,p_ref text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE existing text;
BEGIN
 PERFORM 1 FROM execution_dispatches WHERE order_id=p_order AND provider=p_provider FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch not found' USING ERRCODE='P0002'; END IF;
 IF p_state NOT IN ('submitted','uncertain') OR p_state IS NULL THEN RAISE EXCEPTION 'Invalid dispatch state' USING ERRCODE='22023'; END IF;
 SELECT provider_order_ref INTO existing FROM execution_dispatch_events WHERE order_id=p_order AND state='submitted';
 IF FOUND THEN
  IF p_state='submitted' AND existing IS DISTINCT FROM p_ref THEN RAISE EXCEPTION 'Conflicting execution reference' USING ERRCODE='22023'; END IF;
  RETURN;
 END IF;
 INSERT INTO execution_dispatch_events(id,order_id,provider,state,provider_order_ref) VALUES(p_id,p_order,p_provider,p_state,p_ref) ON CONFLICT(order_id,state) DO NOTHING;
END; $$;
-- Dispatch/cancellation serialize on the SAME reservation row. Once intent is
-- committed, never release funds based on a timeout or unknown provider result.
CREATE OR REPLACE FUNCTION cancel_execution_order(p_id uuid,p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE held_state text;
BEGIN
 PERFORM 1 FROM execution_orders o JOIN fund_reservations r ON r.id=o.id WHERE o.id=p_id AND o.user_id=p_user FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM execution_order_events WHERE order_id=p_id AND state='cancelled') THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM execution_dispatches WHERE order_id=p_id) THEN RAISE EXCEPTION 'Execution initiated; reconciliation required' USING ERRCODE='40001'; END IF;
 SELECT state INTO held_state FROM fund_reservation_states WHERE id=p_id;
 IF held_state IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'Order funds no longer held' USING ERRCODE='40001'; END IF;
 PERFORM release_customer_funds(p_user,p_id,'Customer cancelled queued order');
 INSERT INTO execution_order_events(order_id,sequence,state) VALUES(p_id,2,'cancelled');
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'order.cancelled');
END; $$;
REVOKE ALL ON execution_dispatches,execution_dispatch_events FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_execution_dispatch(uuid,text),record_execution_dispatch(uuid,uuid,text,text,text) FROM PUBLIC;
