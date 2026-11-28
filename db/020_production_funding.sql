-- Production funding lifecycle foundation. Live posting requires independent provider/refetch reconciliation.
ALTER TABLE funding_requests DROP CONSTRAINT IF EXISTS funding_requests_environment_check;
ALTER TABLE funding_requests ADD CONSTRAINT funding_requests_environment_check CHECK(environment IN ('sandbox','production'));
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS settled_asset text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS settled_units numeric;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS credited_journal_id uuid REFERENCES ledger_journals(id);
ALTER TABLE funding_requests DROP CONSTRAINT IF EXISTS funding_requests_settled_units_integral;
ALTER TABLE funding_requests ADD CONSTRAINT funding_requests_settled_units_integral CHECK(settled_units IS NULL OR (settled_units=trunc(settled_units) AND settled_units>0));
CREATE UNIQUE INDEX IF NOT EXISTS funding_requests_provider_payment_idx ON funding_requests(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS funding_requests_production_owner_idx ON funding_requests(user_id,created_at) WHERE environment='production';

INSERT INTO ledger_assets(code,decimals) VALUES('USD',2) ON CONFLICT(code) DO NOTHING;

ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS requested_asset text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS requested_network text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS provider_pay_currency text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS provider_network text;
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'unreconciled';
ALTER TABLE funding_requests ADD COLUMN IF NOT EXISTS settled_at timestamptz;

CREATE OR REPLACE FUNCTION reconcile_production_deposit(p_request uuid,p_payment text,p_invoice text,p_status text,p_usd numeric,p_evidence text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE request funding_requests%ROWTYPE; liability uuid; custody uuid; journal uuid; cents bigint;
BEGIN
 IF p_status IS DISTINCT FROM 'finished' THEN RAISE EXCEPTION 'Payment is not final'; END IF;
 IF p_usd IS NULL OR p_usd<=0 OR (p_usd*100)<>trunc(p_usd*100) THEN RAISE EXCEPTION 'Invalid settled USD amount'; END IF;
 SELECT * INTO request FROM funding_requests WHERE id=p_request AND environment='production' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Production funding request not found'; END IF;
 IF request.provider_id IS DISTINCT FROM p_invoice OR request.amount_usd IS DISTINCT FROM p_usd THEN RAISE EXCEPTION 'Invoice, request or amount mismatch'; END IF;
 IF request.credited_journal_id IS NOT NULL THEN RETURN request.credited_journal_id; END IF;
 SELECT id INTO custody FROM ledger_accounts WHERE asset='USD' AND kind='custody' AND user_id IS NULL LIMIT 1;
 IF custody IS NULL THEN
  custody:=gen_random_uuid();
  INSERT INTO ledger_accounts(id,asset,kind,user_id) VALUES(custody,'USD','custody',NULL);
 END IF;
 INSERT INTO ledger_accounts(id,asset,kind,user_id) VALUES(gen_random_uuid(),'USD','customer_liability',request.user_id)
 ON CONFLICT DO NOTHING;
 SELECT id INTO liability FROM ledger_accounts WHERE user_id=request.user_id AND asset='USD' AND kind='customer_liability';
 IF liability IS NULL THEN RAISE EXCEPTION 'Customer liability account missing'; END IF;
 cents:=(trunc(p_usd*100))::bigint;
 journal:=ledger_post(gen_random_uuid(),'nowpayments-deposit:'||p_payment,p_evidence,jsonb_build_array(
   jsonb_build_object('accountId',custody,'asset','USD','units',cents::text),
   jsonb_build_object('accountId',liability,'asset','USD','units','-'||cents::text)),NULL);
 UPDATE funding_requests SET provider_payment_id=p_payment,provider_status=p_status,settled_asset='USD',settled_units=cents,credited_journal_id=journal,status='finished',updated_at=now() WHERE id=p_request;
 RETURN journal;
END; $$;
REVOKE ALL ON FUNCTION reconcile_production_deposit(uuid,text,text,text,numeric,text) FROM PUBLIC;

UPDATE funding_requests SET reconciliation_status='unreconciled' WHERE reconciliation_status IS NULL;
