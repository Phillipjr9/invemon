-- Internal execution-adapter contract. No quotes, instruments or fills seeded.
CREATE TABLE IF NOT EXISTS execution_quotes (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 operation text NOT NULL CHECK(operation IN ('crypto_buy','crypto_sell','crypto_swap','stock_buy')),
 source_account_id uuid NOT NULL,
 source_asset text NOT NULL,
 source_units numeric NOT NULL CHECK(source_units>0 AND source_units=trunc(source_units) AND source_units<1e78),
 target_symbol text NOT NULL CHECK(length(target_symbol) BETWEEN 1 AND 80),
 target_units numeric NOT NULL CHECK(target_units>0 AND target_units=trunc(target_units) AND target_units<1e78),
 target_decimals smallint NOT NULL CHECK(target_decimals BETWEEN 0 AND 30),
 fee_units numeric NOT NULL CHECK(fee_units>=0 AND fee_units=trunc(fee_units) AND fee_units<1e78),
 provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 80),
 provider_quote_ref text NOT NULL CHECK(length(provider_quote_ref) BETWEEN 1 AND 200),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>created_at),
 FOREIGN KEY(source_account_id,source_asset) REFERENCES ledger_accounts(id,asset),
 UNIQUE(provider,provider_quote_ref)
);
CREATE TABLE IF NOT EXISTS execution_orders (
 id uuid PRIMARY KEY REFERENCES fund_reservations(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 quote_id uuid NOT NULL UNIQUE REFERENCES execution_quotes(id),
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS execution_order_events (
 order_id uuid NOT NULL REFERENCES execution_orders(id),
 sequence smallint NOT NULL CHECK(sequence IN (1,2)),
 state text NOT NULL CHECK(state IN ('queued','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,sequence),
 CHECK((sequence=1 AND state='queued') OR (sequence=2 AND state='cancelled'))
);
CREATE INDEX IF NOT EXISTS execution_orders_owner ON execution_orders(user_id,created_at DESC,id DESC);
DROP TRIGGER IF EXISTS execution_quotes_immutable ON execution_quotes;
CREATE TRIGGER execution_quotes_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_quotes FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS execution_orders_immutable ON execution_orders;
CREATE TRIGGER execution_orders_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_orders FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS execution_order_events_immutable ON execution_order_events;
CREATE TRIGGER execution_order_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_order_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION accept_execution_quote(p_id uuid,p_user uuid,p_quote uuid,p_key uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE q execution_quotes; existing execution_orders; reserved uuid;
BEGIN
 -- Lock quote before account; serializes acceptance of the same provider quote.
 SELECT * INTO q FROM execution_quotes WHERE id=p_quote AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE='P0002'; END IF;
 PERFORM lock_customer_funds(q.source_account_id);
 SELECT * INTO existing FROM execution_orders WHERE user_id=p_user AND request_key=p_key;
 IF FOUND THEN
  IF existing.quote_id<>p_quote THEN RAISE EXCEPTION 'Request key has different quote' USING ERRCODE='22023'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM execution_orders WHERE quote_id=p_quote) THEN RAISE EXCEPTION 'Quote already accepted' USING ERRCODE='22023'; END IF;
 IF q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Quote expired' USING ERRCODE='22023'; END IF;
 reserved:=reserve_customer_funds(p_id,p_user,q.source_account_id,q.source_asset,(q.source_units+q.fee_units)::text,'order','execution:'||p_key::text);
 INSERT INTO execution_orders VALUES(reserved,p_user,p_quote,p_key,now());
 INSERT INTO execution_order_events(order_id,sequence,state) VALUES(reserved,1,'queued');
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'order.queued');
 RETURN reserved;
END; $$;
CREATE OR REPLACE FUNCTION cancel_execution_order(p_id uuid,p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE held_state text;
BEGIN
 PERFORM 1 FROM execution_orders o JOIN fund_reservations r ON r.id=o.id WHERE o.id=p_id AND o.user_id=p_user FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM execution_order_events WHERE order_id=p_id AND state='cancelled') THEN RETURN; END IF;
 SELECT state INTO held_state FROM fund_reservation_states WHERE id=p_id;
 IF held_state IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'Order funds no longer held' USING ERRCODE='40001'; END IF;
 PERFORM release_customer_funds(p_user,p_id,'Customer cancelled queued order');
 INSERT INTO execution_order_events(order_id,sequence,state) VALUES(p_id,2,'cancelled');
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'order.cancelled');
END; $$;
REVOKE ALL ON execution_quotes,execution_orders,execution_order_events FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_execution_quote(uuid,uuid,uuid,uuid),cancel_execution_order(uuid,uuid) FROM PUBLIC;
