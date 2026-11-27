-- Production accounting foundation. No provider callback can post through this migration.
-- Amounts are signed integer atomic units; an asset identifies currency AND network.
CREATE TABLE IF NOT EXISTS ledger_assets (
 code text PRIMARY KEY CHECK(code ~ '^[A-Z0-9_:.-]{2,80}$'),
 decimals smallint NOT NULL CHECK(decimals BETWEEN 0 AND 30)
);
CREATE TABLE IF NOT EXISTS ledger_accounts (
 id uuid PRIMARY KEY,
 asset text NOT NULL REFERENCES ledger_assets(code),
 kind text NOT NULL CHECK(kind IN ('custody','customer_liability','fee','clearing')),
 user_id uuid REFERENCES app_users(id),
 CHECK ((kind='customer_liability') = (user_id IS NOT NULL)),
 UNIQUE(id,asset)
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_customer_asset ON ledger_accounts(user_id,asset) WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ledger_journals (
 id uuid PRIMARY KEY,
 posting_key text NOT NULL UNIQUE CHECK(length(posting_key) BETWEEN 1 AND 200),
 evidence_ref text NOT NULL UNIQUE CHECK(length(evidence_ref) BETWEEN 1 AND 300),
 payload jsonb NOT NULL,
 reverses uuid UNIQUE REFERENCES ledger_journals(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 insertion_xid bigint NOT NULL DEFAULT txid_current()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
 journal_id uuid NOT NULL REFERENCES ledger_journals(id),
 line integer NOT NULL CHECK(line>=0),
 account_id uuid NOT NULL,
 asset text NOT NULL,
 units numeric NOT NULL CHECK(units<>0 AND units=trunc(units) AND abs(units)<1e78),
 PRIMARY KEY(journal_id,line),
 FOREIGN KEY(account_id,asset) REFERENCES ledger_accounts(id,asset)
);
CREATE INDEX IF NOT EXISTS ledger_entries_account ON ledger_entries(account_id,journal_id);
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Ledger records are immutable; post a compensating journal';
END;
$$;
DROP TRIGGER IF EXISTS ledger_assets_immutable ON ledger_assets;
CREATE TRIGGER ledger_assets_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_assets FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS ledger_accounts_immutable ON ledger_accounts;
CREATE TRIGGER ledger_accounts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_accounts FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS ledger_journals_immutable ON ledger_journals;
CREATE TRIGGER ledger_journals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_journals FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION ledger_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_journals WHERE id=NEW.journal_id AND insertion_xid=txid_current()) THEN
  RAISE EXCEPTION 'Cannot append to a committed journal';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ledger_entry_insert ON ledger_entries;
CREATE TRIGGER ledger_entry_insert BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_entry_insert_guard();
CREATE OR REPLACE FUNCTION ledger_validate_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payload IS DISTINCT FROM jsonb_build_object('evidence',NEW.evidence_ref,'reverses',NEW.reverses,'lines',
  (SELECT jsonb_agg(jsonb_build_object('accountId',account_id,'asset',asset,'units',units::text) ORDER BY line) FROM ledger_entries WHERE journal_id=NEW.id)) THEN
  RAISE EXCEPTION 'Journal evidence envelope does not match entries';
 END IF;
 IF (SELECT count(*) FROM ledger_entries WHERE journal_id=NEW.id)<2 OR EXISTS(
  SELECT asset FROM ledger_entries WHERE journal_id=NEW.id GROUP BY asset HAVING sum(units)<>0
 ) THEN RAISE EXCEPTION 'Journal must contain at least two lines and balance per asset'; END IF;
 IF NEW.reverses IS NOT NULL AND (
  EXISTS(SELECT account_id,asset,sum(units) FROM ledger_entries WHERE journal_id=NEW.id GROUP BY account_id,asset
   EXCEPT SELECT account_id,asset,-sum(units) FROM ledger_entries WHERE journal_id=NEW.reverses GROUP BY account_id,asset)
  OR EXISTS(SELECT account_id,asset,-sum(units) FROM ledger_entries WHERE journal_id=NEW.reverses GROUP BY account_id,asset
   EXCEPT SELECT account_id,asset,sum(units) FROM ledger_entries WHERE journal_id=NEW.id GROUP BY account_id,asset)
 ) THEN RAISE EXCEPTION 'Reversal must exactly negate the original journal'; END IF;
 RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS ledger_journal_balanced ON ledger_journals;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_validate_journal();
-- One statement is atomic on Neon HTTP. Advisory lock serializes retries for a posting key.
CREATE OR REPLACE FUNCTION ledger_post(p_id uuid,p_key text,p_evidence text,p_lines jsonb,p_reverses uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing ledger_journals%ROWTYPE; value jsonb; ordinal integer:=0; envelope jsonb;
BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'Expected 2 to 100 ledger lines';
 END IF;
 envelope:=jsonb_build_object('evidence',p_evidence,'lines',p_lines,'reverses',p_reverses);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 SELECT * INTO existing FROM ledger_journals WHERE posting_key=p_key;
 IF FOUND THEN
  IF existing.payload IS DISTINCT FROM envelope THEN RAISE EXCEPTION 'Posting key reused with different evidence or lines'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO ledger_journals(id,posting_key,evidence_ref,payload,reverses) VALUES(p_id,p_key,p_evidence,envelope,p_reverses);
 FOR value IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(value->'units') IS DISTINCT FROM 'string' OR (value->>'units') !~ '^-?[1-9][0-9]{0,77}$' THEN
   RAISE EXCEPTION 'Units must be nonzero integer strings';
  END IF;
  INSERT INTO ledger_entries(journal_id,line,account_id,asset,units)
   VALUES(p_id,ordinal,(value->>'accountId')::uuid,value->>'asset',(value->>'units')::numeric);
  ordinal:=ordinal+1;
 END LOOP;
 RETURN p_id;
END;
$$;
-- Positive balances are debits. Customer liabilities are negative (credit-normal).
-- These are accounting balances, NOT automatically available-to-trade balances.
CREATE OR REPLACE VIEW ledger_account_balances AS
 SELECT a.id,a.user_id,a.kind,a.asset,coalesce(sum(e.units),0)::text AS debit_units
 FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id GROUP BY a.id;
REVOKE ALL ON ledger_assets,ledger_accounts,ledger_journals,ledger_entries FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger_post(uuid,text,text,jsonb,uuid) FROM PUBLIC;
