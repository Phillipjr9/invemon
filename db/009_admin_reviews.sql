-- Internal administrative review of held withdrawal reservations. No payouts.
CREATE TABLE IF NOT EXISTS admin_review_events (
 id uuid PRIMARY KEY,
 reservation_id uuid NOT NULL REFERENCES fund_reservations(id),
 revision integer NOT NULL CHECK(revision>0),
 actor_id uuid NOT NULL REFERENCES app_users(id),
 decision text NOT NULL CHECK(decision IN ('reviewing','approved','rejected')),
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(reservation_id,revision)
);
DROP TRIGGER IF EXISTS admin_reviews_immutable ON admin_review_events;
CREATE TRIGGER admin_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_review_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION admin_review_withdrawal(p_id uuid,p_reservation uuid,p_actor uuid,p_revision integer,p_decision text,p_note text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r fund_reservations; current_revision integer; previous_decision text; current_state text;
BEGIN
 SELECT * INTO r FROM fund_reservations WHERE id=p_reservation FOR UPDATE;
 IF NOT FOUND OR r.purpose<>'withdrawal' THEN RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE='P0002'; END IF;
 SELECT revision,decision INTO current_revision,previous_decision FROM admin_review_events WHERE reservation_id=p_reservation ORDER BY revision DESC LIMIT 1;
 current_revision:=coalesce(current_revision,0);
 IF p_revision IS DISTINCT FROM current_revision THEN RAISE EXCEPTION 'Review changed; reload before acting' USING ERRCODE='40001'; END IF;
 IF previous_decision='rejected' THEN RAISE EXCEPTION 'Review is terminal' USING ERRCODE='40001'; END IF;
 SELECT state INTO current_state FROM fund_reservation_states WHERE id=p_reservation;
 IF current_state IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'Funds are no longer held' USING ERRCODE='40001'; END IF;
 IF p_decision NOT IN ('reviewing','approved','rejected') OR p_decision IS NULL OR p_note IS NULL OR length(trim(p_note)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 IF p_decision='rejected' THEN PERFORM release_customer_funds(r.user_id,r.id,'Admin rejected withdrawal'); END IF;
 INSERT INTO admin_review_events VALUES(p_id,p_reservation,current_revision+1,p_actor,p_decision,trim(p_note),now());
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_actor,'admin.withdrawal.'||p_decision);
 RETURN current_revision+1;
END; $$;
REVOKE ALL ON admin_review_events FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_review_withdrawal(uuid,uuid,uuid,integer,text,text) FROM PUBLIC;
