-- Internal fund reservations. This migration neither sends payments nor enables trading.
CREATE TABLE IF NOT EXISTS fund_reservations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 account_id uuid NOT NULL,
 asset text NOT NULL,
 units numeric NOT NULL CHECK(units>0 AND units=trunc(units) AND units<1e78),
 purpose text NOT NULL CHECK(purpose IN ('withdrawal','order')),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key),
 FOREIGN KEY(account_id,asset) REFERENCES ledger_accounts(id,asset)
);
CREATE INDEX IF NOT EXISTS fund_reservations_account ON fund_reservations(account_id);
CREATE TABLE IF NOT EXISTS fund_reservation_events (
 reservation_id uuid NOT NULL REFERENCES fund_reservations(id),
 sequence smallint NOT NULL CHECK(sequence IN (1,2)),
 state text NOT NULL CHECK(state IN ('held','released','consumed')),
 journal_id uuid UNIQUE REFERENCES ledger_journals(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reservation_id,sequence),
 CHECK((sequence=1 AND state='held') OR (sequence=2 AND state IN ('released','consumed'))),
 CHECK((state='consumed')=(journal_id IS NOT NULL))
);
DROP TRIGGER IF EXISTS fund_reservations_immutable ON fund_reservations;
CREATE TRIGGER fund_reservations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON fund_reservations FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS fund_reservation_events_immutable ON fund_reservation_events;
CREATE TRIGGER fund_reservation_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON fund_reservation_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE VIEW fund_reservation_states AS
 SELECT r.*,e.state,e.journal_id,e.reason,e.created_at AS state_changed_at
 FROM fund_reservations r JOIN fund_reservation_events e ON e.reservation_id=r.id
 WHERE NOT EXISTS(SELECT 1 FROM fund_reservation_events later WHERE later.reservation_id=e.reservation_id AND later.sequence>e.sequence);
CREATE OR REPLACE VIEW ledger_spendable_balances AS
 SELECT b.id,b.user_id,b.kind,b.asset,(-b.debit_units::numeric)::text AS total_units,
 coalesce(h.units,0)::text AS reserved_units,
 (-b.debit_units::numeric-coalesce(h.units,0))::text AS available_units
 FROM ledger_account_balances b LEFT JOIN (
  SELECT account_id,sum(units) AS units FROM fund_reservation_states WHERE state='held' GROUP BY account_id
 ) h ON h.account_id=b.id WHERE b.kind='customer_liability';
CREATE OR REPLACE FUNCTION lock_customer_funds(p_account uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 -- The lock must precede fresh READ COMMITTED reads of both journal and holds.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Fund mutations require READ COMMITTED isolation';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-funds:'||p_account::text,0));
END;
$$;
CREATE OR REPLACE FUNCTION reservation_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM lock_customer_funds(NEW.account_id);
 IF NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=NEW.account_id AND asset=NEW.asset AND user_id=NEW.user_id AND kind='customer_liability') THEN
  RAISE EXCEPTION 'Reservation account does not belong to this customer';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reservation_insert ON fund_reservations;
CREATE TRIGGER reservation_insert BEFORE INSERT ON fund_reservations FOR EACH ROW EXECUTE FUNCTION reservation_insert_guard();
CREATE OR REPLACE FUNCTION reservation_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reservation fund_reservations%ROWTYPE;
BEGIN
 SELECT * INTO STRICT reservation FROM fund_reservations WHERE id=NEW.reservation_id;
 PERFORM lock_customer_funds(reservation.account_id);
 IF NEW.sequence=2 AND NOT EXISTS(SELECT 1 FROM fund_reservation_events WHERE reservation_id=NEW.reservation_id AND sequence=1) THEN
  RAISE EXCEPTION 'Reservation must be held before it can be finalized';
 END IF;
 IF NEW.state='consumed' AND NOT EXISTS(SELECT 1 FROM ledger_journals WHERE id=NEW.journal_id AND insertion_xid=txid_current()) THEN
  RAISE EXCEPTION 'Reservation debit must be posted atomically with consumption';
 END IF;
 IF NEW.state='consumed' AND (
  (SELECT coalesce(sum(units),0) FROM ledger_entries WHERE journal_id=NEW.journal_id AND account_id=reservation.account_id)<>reservation.units
  OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=NEW.journal_id AND account_id=reservation.account_id)
 ) THEN RAISE EXCEPTION 'Consumed reservation requires an exact matching customer debit journal'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reservation_event_insert ON fund_reservation_events;
CREATE TRIGGER reservation_event_insert BEFORE INSERT ON fund_reservation_events FOR EACH ROW EXECUTE FUNCTION reservation_event_guard();
CREATE OR REPLACE FUNCTION assert_customer_funds(p_account uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE available numeric;
BEGIN
 SELECT available_units::numeric INTO available FROM ledger_spendable_balances WHERE id=p_account;
 IF available<0 THEN RAISE EXCEPTION 'Insufficient unreserved funds'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION reservation_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account uuid;
BEGIN
 IF TG_TABLE_NAME='fund_reservations' THEN
  IF NOT EXISTS(SELECT 1 FROM fund_reservation_events WHERE reservation_id=NEW.id AND sequence=1) THEN
   RAISE EXCEPTION 'Reservation must have an initial held event';
  END IF;
  account:=NEW.account_id;
 ELSE SELECT account_id INTO STRICT account FROM fund_reservations WHERE id=NEW.reservation_id;
 END IF;
 PERFORM assert_customer_funds(account);
 RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS reservation_commit ON fund_reservations;
CREATE CONSTRAINT TRIGGER reservation_commit AFTER INSERT ON fund_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reservation_commit_guard();
DROP TRIGGER IF EXISTS reservation_event_commit ON fund_reservation_events;
CREATE CONSTRAINT TRIGGER reservation_event_commit AFTER INSERT ON fund_reservation_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reservation_commit_guard();
-- Every customer journal mutation uses the SAME lock as reservation creation/release.
CREATE OR REPLACE FUNCTION ledger_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_journals WHERE id=NEW.journal_id AND insertion_xid=txid_current()) THEN
  RAISE EXCEPTION 'Cannot append to a committed journal';
 END IF;
 IF EXISTS(SELECT 1 FROM ledger_accounts WHERE id=NEW.account_id AND kind='customer_liability') THEN
  PERFORM lock_customer_funds(NEW.account_id);
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION journal_funds_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account uuid;
BEGIN
 FOR account IN SELECT DISTINCT a.id FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.journal_id=NEW.id AND a.kind='customer_liability' LOOP
  PERFORM assert_customer_funds(account);
 END LOOP;
 RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS journal_funds_commit ON ledger_journals;
CREATE CONSTRAINT TRIGGER journal_funds_commit AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_funds_commit_guard();
CREATE OR REPLACE FUNCTION reserve_customer_funds(p_id uuid,p_user uuid,p_account uuid,p_asset text,p_units text,p_purpose text,p_key text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing fund_reservations%ROWTYPE;
BEGIN
 IF p_units IS NULL OR p_units !~ '^[1-9][0-9]{0,77}$' THEN RAISE EXCEPTION 'Reservation requires exact positive integer units'; END IF;
 PERFORM lock_customer_funds(p_account);
 SELECT * INTO existing FROM fund_reservations WHERE user_id=p_user AND request_key=p_key;
 IF FOUND THEN
  IF existing.account_id IS DISTINCT FROM p_account OR existing.asset IS DISTINCT FROM p_asset OR existing.units IS DISTINCT FROM p_units::numeric OR existing.purpose IS DISTINCT FROM p_purpose THEN RAISE EXCEPTION 'Reservation key reused with different contents'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO fund_reservations(id,user_id,account_id,asset,units,purpose,request_key) VALUES(p_id,p_user,p_account,p_asset,p_units::numeric,p_purpose,p_key);
 INSERT INTO fund_reservation_events VALUES(p_id,1,'held',NULL,'Funds reserved',now());
 PERFORM assert_customer_funds(p_account);
 RETURN p_id;
END;
$$;
CREATE OR REPLACE FUNCTION release_customer_funds(p_user uuid,p_id uuid,p_reason text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE reservation fund_reservations%ROWTYPE; terminal fund_reservation_events%ROWTYPE;
BEGIN
 SELECT * INTO STRICT reservation FROM fund_reservations WHERE id=p_id AND user_id=p_user;
 PERFORM lock_customer_funds(reservation.account_id);
 SELECT * INTO terminal FROM fund_reservation_events WHERE reservation_id=p_id AND sequence=2;
 IF FOUND THEN
  IF terminal.state<>'released' OR terminal.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Reservation is already finalized differently'; END IF;
  RETURN p_id;
 END IF;
 INSERT INTO fund_reservation_events VALUES(p_id,2,'released',NULL,p_reason,now());
 RETURN p_id;
END;
$$;
-- Internal accounting finalization ONLY. Caller must independently verify external
-- execution/payment evidence. Calling this is not a payout or proof of payment.
CREATE OR REPLACE FUNCTION consume_customer_funds(p_user uuid,p_id uuid,p_journal uuid,p_key text,p_evidence text,p_counterpart uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE reservation fund_reservations%ROWTYPE; terminal fund_reservation_events%ROWTYPE; posted uuid; lines jsonb;
BEGIN
 SELECT * INTO STRICT reservation FROM fund_reservations WHERE id=p_id AND user_id=p_user;
 PERFORM lock_customer_funds(reservation.account_id);
 IF NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p_counterpart AND asset=reservation.asset AND kind IN ('custody','clearing') AND user_id IS NULL) THEN
  RAISE EXCEPTION 'Counterpart must be a matching business custody or clearing account';
 END IF;
 SELECT * INTO terminal FROM fund_reservation_events WHERE reservation_id=p_id AND sequence=2;
 IF FOUND AND terminal.state<>'consumed' THEN RAISE EXCEPTION 'Released reservation cannot be consumed'; END IF;
 lines:=jsonb_build_array(jsonb_build_object('accountId',reservation.account_id,'asset',reservation.asset,'units',reservation.units::text),jsonb_build_object('accountId',p_counterpart,'asset',reservation.asset,'units',(-reservation.units)::text));
 posted:=ledger_post(p_journal,p_key,p_evidence,lines,NULL);
 IF terminal.state='consumed' THEN
  IF terminal.journal_id<>posted THEN RAISE EXCEPTION 'Reservation already consumed by another journal'; END IF;
  RETURN posted;
 END IF;
 INSERT INTO fund_reservation_events VALUES(p_id,2,'consumed',posted,'Reserved debit posted',now());
 RETURN posted;
END;
$$;
REVOKE ALL ON fund_reservations,fund_reservation_events,fund_reservation_states,ledger_spendable_balances FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_customer_funds(uuid,uuid,uuid,text,text,text,text),release_customer_funds(uuid,uuid,text),consume_customer_funds(uuid,uuid,uuid,text,text,uuid),lock_customer_funds(uuid),assert_customer_funds(uuid) FROM PUBLIC;
