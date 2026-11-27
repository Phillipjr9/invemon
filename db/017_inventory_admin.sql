-- Operational configuration only. These controls cannot post ledger credits.
ALTER TABLE dealer_pairs ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE IF NOT EXISTS dealer_admin_events (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES app_users(id),
 action text NOT NULL CHECK(action IN('pair.save','inventory.register','inventory.evidence')),
 subject_id uuid NOT NULL,
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 2000),
 before_state jsonb,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS dealer_admin_events_immutable ON dealer_admin_events;
CREATE TRIGGER dealer_admin_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dealer_admin_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE OR REPLACE FUNCTION admin_dealer_change(p_event uuid,p_actor uuid,p_action text,p_id uuid,p_revision integer,p_note text,p_data jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE old_pair dealer_pairs; saved dealer_pairs; asset_code text;
BEGIN
 IF length(trim(p_note)) NOT BETWEEN 1 AND 2000 OR p_note IS NULL THEN RAISE EXCEPTION 'Audit note required' USING ERRCODE='22023'; END IF;
 -- Same serialization domain as accepts: stop/price changes take effect before subsequent accepts.
 PERFORM pg_advisory_xact_lock(hashtextextended('invemon-dealer',0));
 IF p_action='pair.save' THEN
  SELECT * INTO old_pair FROM dealer_pairs WHERE id=p_id FOR UPDATE;
  IF (FOUND AND old_pair.revision<>p_revision) OR (NOT FOUND AND p_revision<>0) THEN RAISE EXCEPTION 'Stale pair revision' USING ERRCODE='40001'; END IF;
  IF old_pair.id IS NOT NULL AND (old_pair.source_asset<>p_data->>'sourceAsset' OR old_pair.target_asset<>p_data->>'targetAsset' OR old_pair.source_inventory<>(p_data->>'sourceInventory')::uuid OR old_pair.target_inventory<>(p_data->>'targetInventory')::uuid) THEN RAISE EXCEPTION 'Pair mappings are immutable' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM dealer_inventory_accounts i JOIN ledger_accounts a ON a.id=i.account_id WHERE a.id=(p_data->>'sourceInventory')::uuid AND a.asset=p_data->>'sourceAsset') OR NOT EXISTS(SELECT 1 FROM dealer_inventory_accounts i JOIN ledger_accounts a ON a.id=i.account_id WHERE a.id=(p_data->>'targetInventory')::uuid AND a.asset=p_data->>'targetAsset') THEN RAISE EXCEPTION 'Inventory asset mismatch' USING ERRCODE='22023'; END IF;
  IF (p_data->>'enabled')::boolean AND ((p_data->>'validUntil')::timestamptz<=clock_timestamp() OR (p_data->>'validUntil')::timestamptz>clock_timestamp()+interval '7 days') THEN RAISE EXCEPTION 'Enabled policies require expiry within seven days' USING ERRCODE='22023'; END IF;
  INSERT INTO dealer_pairs(id,source_asset,target_asset,source_inventory,target_inventory,rate_numerator,rate_denominator,fee_bps,min_units,max_units,valid_until,enabled,revision)
  VALUES(p_id,p_data->>'sourceAsset',p_data->>'targetAsset',(p_data->>'sourceInventory')::uuid,(p_data->>'targetInventory')::uuid,(p_data->>'numerator')::numeric,(p_data->>'denominator')::numeric,(p_data->>'feeBps')::integer,(p_data->>'minUnits')::numeric,(p_data->>'maxUnits')::numeric,(p_data->>'validUntil')::timestamptz,(p_data->>'enabled')::boolean,1)
  ON CONFLICT(id) DO UPDATE SET rate_numerator=excluded.rate_numerator,rate_denominator=excluded.rate_denominator,fee_bps=excluded.fee_bps,min_units=excluded.min_units,max_units=excluded.max_units,valid_until=excluded.valid_until,enabled=excluded.enabled,revision=dealer_pairs.revision+1 RETURNING * INTO saved;
  INSERT INTO dealer_admin_events VALUES(p_event,p_actor,p_action,p_id,trim(p_note),CASE WHEN old_pair.id IS NULL THEN NULL ELSE to_jsonb(old_pair) END,to_jsonb(saved),now());
 ELSIF p_action='inventory.register' THEN
  asset_code:=p_data->>'asset';
  IF NOT EXISTS(SELECT 1 FROM dealer_assets WHERE dealer_assets.code=asset_code) THEN RAISE EXCEPTION 'Asset must be approved operationally first' USING ERRCODE='22023'; END IF;
  INSERT INTO ledger_accounts(id,asset,kind,user_id) VALUES(p_id,asset_code,'clearing',NULL);
  INSERT INTO dealer_inventory_accounts VALUES(p_id);
  INSERT INTO dealer_admin_events VALUES(p_event,p_actor,p_action,p_id,trim(p_note),NULL,jsonb_build_object('asset',asset_code,'funded',false),now());
 ELSIF p_action='inventory.evidence' THEN
  IF NOT EXISTS(SELECT 1 FROM dealer_inventory_accounts WHERE account_id=p_id) THEN RAISE EXCEPTION 'Inventory not found' USING ERRCODE='P0002'; END IF;
  IF length(p_data->>'reference') NOT BETWEEN 1 AND 200 OR p_data->>'reference' IS NULL THEN RAISE EXCEPTION 'Evidence reference required' USING ERRCODE='22023'; END IF;
  INSERT INTO dealer_admin_events VALUES(p_event,p_actor,p_action,p_id,trim(p_note),NULL,jsonb_build_object('reference',p_data->>'reference','verified',false,'creditPosted',false),now());
 ELSE RAISE EXCEPTION 'Unsupported inventory operation' USING ERRCODE='22023'; END IF;
 INSERT INTO security_events(id,user_id,action) VALUES(gen_random_uuid(),p_actor,'admin.dealer.'||p_action);
 RETURN p_id;
END; $$;
REVOKE ALL ON dealer_admin_events FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_dealer_change(uuid,uuid,text,uuid,integer,text,jsonb) FROM PUBLIC;
