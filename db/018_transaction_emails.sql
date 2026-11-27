-- Notify only after persisted events, atomically with the business transaction.
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_type_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_type_check CHECK(type IN ('welcome','sign_in','password_changed','support_received','workspace_saved','preview','trade_settled','withdrawal_requested','withdrawal_reviewing','withdrawal_approved','withdrawal_rejected','withdrawal_cancelled'));
CREATE OR REPLACE FUNCTION enqueue_financial_email() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; event_type text; reference_id uuid; event_key_value text;
BEGIN
 IF TG_TABLE_NAME='dealer_trades' THEN
  owner_id:=NEW.user_id;event_type:='trade_settled';reference_id:=NEW.quote_id;event_key_value:='trade-settled:'||NEW.quote_id;
 ELSIF TG_TABLE_NAME='withdrawal_requests' THEN
  owner_id:=NEW.user_id;event_type:='withdrawal_requested';reference_id:=NEW.id;event_key_value:='withdrawal-requested:'||NEW.id;
 ELSIF TG_TABLE_NAME='admin_review_events' THEN
  -- Only real customer withdrawal requests; never legacy generic reservations.
  SELECT user_id INTO owner_id FROM withdrawal_requests WHERE id=NEW.reservation_id;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  event_type:='withdrawal_'||NEW.decision;reference_id:=NEW.reservation_id;event_key_value:='withdrawal-review:'||NEW.id;
 ELSIF TG_TABLE_NAME='fund_reservation_events' THEN
  IF NEW.reason IS DISTINCT FROM 'Customer cancelled withdrawal' THEN RETURN NEW; END IF;
  SELECT user_id INTO owner_id FROM withdrawal_requests WHERE id=NEW.reservation_id;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  event_type:='withdrawal_cancelled';reference_id:=NEW.reservation_id;event_key_value:='withdrawal-cancelled:'||NEW.reservation_id;
 END IF;
 INSERT INTO email_outbox(id,user_id,event_key,type,payload)
 VALUES(gen_random_uuid(),owner_id,event_key_value,event_type,jsonb_build_object('reference',reference_id::text,'occurredAt',clock_timestamp()))
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dealer_trade_email ON dealer_trades;
CREATE TRIGGER dealer_trade_email AFTER INSERT ON dealer_trades FOR EACH ROW EXECUTE FUNCTION enqueue_financial_email();
DROP TRIGGER IF EXISTS withdrawal_request_email ON withdrawal_requests;
CREATE TRIGGER withdrawal_request_email AFTER INSERT ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION enqueue_financial_email();
DROP TRIGGER IF EXISTS withdrawal_review_email ON admin_review_events;
CREATE TRIGGER withdrawal_review_email AFTER INSERT ON admin_review_events FOR EACH ROW EXECUTE FUNCTION enqueue_financial_email();
DROP TRIGGER IF EXISTS withdrawal_cancel_email ON fund_reservation_events;
CREATE TRIGGER withdrawal_cancel_email AFTER INSERT ON fund_reservation_events FOR EACH ROW EXECUTE FUNCTION enqueue_financial_email();
