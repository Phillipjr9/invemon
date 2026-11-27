-- Business-priced internal crypto exchange. No external execution or liquidity seed.
CREATE TABLE IF NOT EXISTS dealer_inventory_accounts (
 account_id uuid PRIMARY KEY REFERENCES ledger_accounts(id)
);
CREATE TABLE IF NOT EXISTS dealer_assets (
 code text PRIMARY KEY REFERENCES ledger_assets(code),
 kind text NOT NULL CHECK((kind='cash' AND code='USD:BANK') OR (kind='crypto' AND code<>'USD:BANK'))
);
CREATE TABLE IF NOT EXISTS dealer_pairs (
 id uuid PRIMARY KEY,
 source_asset text NOT NULL REFERENCES dealer_assets(code),
 target_asset text NOT NULL REFERENCES dealer_assets(code),
 source_inventory uuid NOT NULL REFERENCES dealer_inventory_accounts(account_id),
 target_inventory uuid NOT NULL REFERENCES dealer_inventory_accounts(account_id),
 rate_numerator numeric NOT NULL CHECK(rate_numerator>0 AND rate_numerator=trunc(rate_numerator) AND rate_numerator<1e38),
 rate_denominator numeric NOT NULL CHECK(rate_denominator>0 AND rate_denominator=trunc(rate_denominator) AND rate_denominator<1e38),
 fee_bps integer NOT NULL CHECK(fee_bps BETWEEN 0 AND 1000),
 min_units numeric NOT NULL CHECK(min_units>0 AND min_units=trunc(min_units)),
 max_units numeric NOT NULL CHECK(max_units>=min_units AND max_units=trunc(max_units) AND max_units<1e38),
 valid_until timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 CHECK(source_asset<>target_asset),
 UNIQUE(source_asset,target_asset)
);
CREATE TABLE IF NOT EXISTS dealer_quotes (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 pair_id uuid NOT NULL REFERENCES dealer_pairs(id),
 source_account uuid NOT NULL REFERENCES ledger_accounts(id),
 target_account uuid NOT NULL REFERENCES ledger_accounts(id),
 source_inventory uuid NOT NULL REFERENCES ledger_accounts(id),
 target_inventory uuid NOT NULL REFERENCES ledger_accounts(id),
 source_asset text NOT NULL REFERENCES ledger_assets(code),
 target_asset text NOT NULL REFERENCES ledger_assets(code),
 source_units numeric NOT NULL CHECK(source_units>0),
 fee_units numeric NOT NULL CHECK(fee_units>=0),
 target_units numeric NOT NULL CHECK(target_units>0),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dealer_trades (
 quote_id uuid PRIMARY KEY REFERENCES dealer_quotes(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES ledger_journals(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dealer_quotes_owner ON dealer_quotes(user_id,created_at DESC);
DROP TRIGGER IF EXISTS dealer_inventory_immutable ON dealer_inventory_accounts;
CREATE TRIGGER dealer_inventory_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dealer_inventory_accounts FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS dealer_quotes_immutable ON dealer_quotes;
CREATE TRIGGER dealer_quotes_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dealer_quotes FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
DROP TRIGGER IF EXISTS dealer_trades_immutable ON dealer_trades;
CREATE TRIGGER dealer_trades_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dealer_trades FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION dealer_inventory_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=NEW.account_id AND kind='clearing' AND user_id IS NULL) THEN RAISE EXCEPTION 'Dealer inventory requires business clearing account'; END IF;
 IF EXISTS(SELECT 1 FROM ledger_entries WHERE account_id=NEW.account_id) THEN RAISE EXCEPTION 'Register inventory before funding it'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dealer_inventory_insert ON dealer_inventory_accounts;
CREATE TRIGGER dealer_inventory_insert BEFORE INSERT ON dealer_inventory_accounts FOR EACH ROW EXECUTE FUNCTION dealer_inventory_insert_guard();
CREATE OR REPLACE FUNCTION dealer_entry_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dealer_inventory_accounts WHERE account_id=NEW.account_id) THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Dealer requires READ COMMITTED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('invemon-dealer',0));
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dealer_entry_lock ON ledger_entries;
CREATE TRIGGER dealer_entry_lock BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION dealer_entry_lock();
CREATE OR REPLACE FUNCTION dealer_inventory_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dealer_inventory_accounts i JOIN ledger_account_balances b ON b.id=i.account_id WHERE b.debit_units::numeric>0) THEN RAISE EXCEPTION 'Insufficient dealer inventory'; END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS dealer_inventory_commit ON ledger_journals;
CREATE CONSTRAINT TRIGGER dealer_inventory_commit AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_inventory_commit();
CREATE OR REPLACE FUNCTION create_dealer_quote(p_id uuid,p_user uuid,p_pair uuid,p_units text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE p dealer_pairs; source_id uuid; target_id uuid; fee numeric; receiving numeric;
BEGIN
 IF p_units IS NULL OR p_units !~ '^[1-9][0-9]{0,37}$' THEN RAISE EXCEPTION 'Invalid source units' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM dealer_pairs WHERE id=p_pair AND enabled AND valid_until>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pair pricing unavailable' USING ERRCODE='22023'; END IF;
 IF p_units::numeric NOT BETWEEN p.min_units AND p.max_units THEN RAISE EXCEPTION 'Amount outside pair limits' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p.source_inventory AND asset=p.source_asset) OR NOT EXISTS(SELECT 1 FROM ledger_accounts WHERE id=p.target_inventory AND asset=p.target_asset) THEN RAISE EXCEPTION 'Pair inventory mismatch'; END IF;
 SELECT id INTO source_id FROM ledger_accounts WHERE user_id=p_user AND asset=p.source_asset AND kind='customer_liability';
 IF source_id IS NULL THEN RAISE EXCEPTION 'Source balance account unavailable' USING ERRCODE='22023'; END IF;
 SELECT id INTO target_id FROM ledger_accounts WHERE user_id=p_user AND asset=p.target_asset AND kind='customer_liability';
 IF target_id IS NULL THEN
  INSERT INTO ledger_accounts(id,asset,kind,user_id) VALUES(gen_random_uuid(),p.target_asset,'customer_liability',p_user) ON CONFLICT DO NOTHING;
  SELECT id INTO target_id FROM ledger_accounts WHERE user_id=p_user AND asset=p.target_asset AND kind='customer_liability';
 END IF;
 fee:=ceil(p_units::numeric*p.fee_bps/10000);receiving:=floor(p_units::numeric*p.rate_numerator/p.rate_denominator);
 IF receiving<=0 OR receiving>=1e78 THEN RAISE EXCEPTION 'Invalid receiving amount' USING ERRCODE='22023'; END IF;
 INSERT INTO dealer_quotes VALUES(p_id,p_user,p.id,source_id,target_id,p.source_inventory,p.target_inventory,p.source_asset,p.target_asset,p_units::numeric,fee,receiving,least(p.valid_until,clock_timestamp()+interval '30 seconds'),now());
 RETURN p_id;
END; $$;
CREATE OR REPLACE FUNCTION accept_dealer_quote(p_quote uuid,p_user uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE q dealer_quotes; existing uuid; journal uuid; available numeric; inventory numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('invemon-dealer',0));
 SELECT * INTO q FROM dealer_quotes WHERE id=p_quote AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE='P0002'; END IF;
 SELECT journal_id INTO existing FROM dealer_trades WHERE quote_id=p_quote AND user_id=p_user;
 IF FOUND THEN RETURN existing; END IF;
 IF q.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM dealer_pairs WHERE id=q.pair_id AND enabled AND valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'Quote expired or pair disabled' USING ERRCODE='22023'; END IF;
 PERFORM lock_customer_funds(id) FROM ledger_accounts WHERE id IN(q.source_account,q.target_account) ORDER BY id;
 SELECT available_units::numeric INTO available FROM ledger_spendable_balances WHERE id=q.source_account;
 SELECT -debit_units::numeric INTO inventory FROM ledger_account_balances WHERE id=q.target_inventory;
 IF available<q.source_units+q.fee_units THEN RAISE EXCEPTION 'Insufficient unreserved funds' USING ERRCODE='22023'; END IF;
 IF inventory<q.target_units THEN RAISE EXCEPTION 'Insufficient dealer inventory' USING ERRCODE='22023'; END IF;
 journal:=ledger_post(gen_random_uuid(),'dealer-trade:'||p_quote::text,'dealer-quote:'||p_quote::text,jsonb_build_array(
 jsonb_build_object('accountId',q.source_account,'asset',q.source_asset,'units',(q.source_units+q.fee_units)::text),
 jsonb_build_object('accountId',q.source_inventory,'asset',q.source_asset,'units',(-(q.source_units+q.fee_units))::text),
 jsonb_build_object('accountId',q.target_inventory,'asset',q.target_asset,'units',q.target_units::text),
 jsonb_build_object('accountId',q.target_account,'asset',q.target_asset,'units',(-q.target_units)::text)),NULL);
 INSERT INTO dealer_trades VALUES(p_quote,p_user,journal,now());
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_user,'dealer.trade');
 RETURN journal;
END; $$;
REVOKE ALL ON dealer_assets,dealer_inventory_accounts,dealer_pairs,dealer_quotes,dealer_trades FROM PUBLIC;
REVOKE ALL ON FUNCTION create_dealer_quote(uuid,uuid,uuid,text),accept_dealer_quote(uuid,uuid) FROM PUBLIC;
