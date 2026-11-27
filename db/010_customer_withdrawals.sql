-- Encrypted immutable destination versions; request references snapshot a version.
CREATE TABLE IF NOT EXISTS withdrawal_destinations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 kind text NOT NULL CHECK(kind IN ('ach','wire','crypto')),
 asset text NOT NULL REFERENCES ledger_assets(code),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 masked text NOT NULL CHECK(length(masked) BETWEEN 1 AND 160),
 encrypted_details text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id,asset)
);
CREATE INDEX IF NOT EXISTS withdrawal_destinations_owner ON withdrawal_destinations(user_id,created_at DESC);
DROP TRIGGER IF EXISTS withdrawal_destinations_immutable ON withdrawal_destinations;
CREATE TRIGGER withdrawal_destinations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON withdrawal_destinations FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE TABLE IF NOT EXISTS withdrawal_requests (
 id uuid PRIMARY KEY REFERENCES fund_reservations(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 destination_id uuid NOT NULL,
 asset text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(destination_id,user_id,asset) REFERENCES withdrawal_destinations(id,user_id,asset)
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_owner ON withdrawal_requests(user_id,created_at DESC);
DROP TRIGGER IF EXISTS withdrawal_requests_immutable ON withdrawal_requests;
CREATE TRIGGER withdrawal_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON withdrawal_requests FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION request_customer_withdrawal(p_id uuid,p_user uuid,p_account uuid,p_destination uuid,p_units text,p_key text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE d withdrawal_destinations; existing uuid; existing_dest uuid; reserved uuid;
BEGIN
 SELECT * INTO d FROM withdrawal_destinations WHERE id=p_destination AND user_id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Destination not found' USING ERRCODE='P0002'; END IF;
 -- Serializes new requests against every other change to this account's funds.
 PERFORM lock_customer_funds(p_account);
 SELECT r.id,w.destination_id INTO existing,existing_dest FROM fund_reservations r LEFT JOIN withdrawal_requests w ON w.id=r.id WHERE r.user_id=p_user AND r.request_key='withdrawal:'||p_key;
 IF existing IS NOT NULL AND existing_dest IS DISTINCT FROM p_destination THEN RAISE EXCEPTION 'Request key has different destination' USING ERRCODE='22023'; END IF;
 reserved:=reserve_customer_funds(p_id,p_user,p_account,d.asset,p_units,'withdrawal','withdrawal:'||p_key);
 IF existing IS NULL THEN
  INSERT INTO withdrawal_requests(id,user_id,destination_id,asset) VALUES(reserved,p_user,p_destination,d.asset);
  INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'withdrawal.requested');
 END IF;
 RETURN reserved;
END; $$;
CREATE OR REPLACE FUNCTION cancel_customer_withdrawal(p_id uuid,p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r fund_reservations; decision text; state text;
BEGIN
 SELECT f.* INTO r FROM fund_reservations f JOIN withdrawal_requests w ON w.id=f.id WHERE f.id=p_id AND w.user_id=p_user FOR UPDATE OF f;
 IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE='P0002'; END IF;
 SELECT e.decision INTO decision FROM admin_review_events e WHERE e.reservation_id=p_id ORDER BY revision DESC LIMIT 1;
 SELECT s.state INTO state FROM fund_reservation_states s WHERE s.id=p_id;
 IF state='released' AND EXISTS(SELECT 1 FROM fund_reservation_events WHERE reservation_id=p_id AND reason='Customer cancelled withdrawal') THEN RETURN; END IF;
 IF decision IN ('approved','rejected') OR state<>'held' THEN RAISE EXCEPTION 'Withdrawal no longer cancellable' USING ERRCODE='40001'; END IF;
 PERFORM release_customer_funds(p_user,p_id,'Customer cancelled withdrawal');
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'withdrawal.cancelled');
END; $$;
REVOKE ALL ON withdrawal_destinations,withdrawal_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION request_customer_withdrawal(uuid,uuid,uuid,uuid,text,text),cancel_customer_withdrawal(uuid,uuid) FROM PUBLIC;
