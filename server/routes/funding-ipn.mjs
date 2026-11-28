import {headers,body,db,HttpError,fail} from '../core.mjs';
import {sandboxEnabled,verifyIpn,fundingEventHash} from '../funding.mjs';
import {readProductionPayment} from '../nowpayments-production.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
  const input=body(req,32000),sql=db(),order=String(input.order_id||''),invoice=String(input.invoice_id||''),payment=String(input.payment_id||''),status=String(input.payment_status||'');
  const states=['waiting','confirming','confirmed','sending','partially_paid','finished','failed','refunded','expired'];
  if(!/^[a-f0-9-]{36}$/i.test(order)||!/\d{1,40}/.test(payment)||!states.includes(status))throw new HttpError(400,'Unsupported callback.');
  if(input.environment==='production'||order){
   const rows=await sql`SELECT id,provider_id,amount_usd FROM funding_requests WHERE id=${order} AND environment='production'`;
   if(rows.length){
    if(!process.env.NOWPAYMENTS_LIVE_DEPOSITS_ENABLED||process.env.NOWPAYMENTS_LIVE_DEPOSITS_ENABLED!=='true')throw new HttpError(503,'Live deposits are disabled.');
    if(!verifyIpn(input,req.headers['x-nowpayments-sig'],process.env.NOWPAYMENTS_IPN_SECRET))throw new HttpError(401,'Invalid callback signature.');
    if(rows[0].provider_id!==invoice)throw new HttpError(409,'Callback does not match the production invoice.');
    if(status!=='finished') {
      await sql`UPDATE funding_requests SET reconciliation_status='not_final',provider_status=${status},updated_at=now() WHERE id=${order}`;
      await sql`INSERT INTO funding_events(event_hash,request_id,provider_payment_id,provider_status) VALUES(${fundingEventHash(input)},${order},${payment},${status}) ON CONFLICT DO NOTHING`;
      throw new HttpError(202,'Payment is not in a final settled state.');
    }
    await sql`INSERT INTO funding_events(event_hash,request_id,provider_payment_id,provider_status) VALUES(${fundingEventHash(input)},${order},${payment},${status}) ON CONFLICT DO NOTHING`;
    await sql`UPDATE funding_requests SET reconciliation_status='pending_provider_refetch',provider_status=${status},updated_at=now() WHERE id=${order}`;
    const provider=await readProductionPayment(payment);
    if(String(provider.payment_id)!==payment)throw new HttpError(409,'Provider payment identity mismatch.');
    if(String(provider.payment_status)!=='finished') {await sql`UPDATE funding_requests SET reconciliation_status='not_final',provider_status=${String(provider.payment_status)},updated_at=now() WHERE id=${order}`;throw new HttpError(202,'Payment is not independently settled.');}
    if(String(provider.invoice_id??provider.invoiceId??invoice)!==invoice)throw new HttpError(409,'Provider invoice identity mismatch.');
    if(String(provider.order_id??provider.orderId??order)!==order)throw new HttpError(409,'Provider order identity mismatch.');
    const expected=Number(rows[0].amount_usd);
    const settled=Number(provider.price_amount);
    if(!Number.isFinite(settled)||Math.abs(settled-expected)>0.000001)throw new HttpError(409,'Provider amount mismatch.');
    if(String(provider.price_currency||'usd').toLowerCase()!=='usd')throw new HttpError(409,'Provider currency mismatch.');
    const callbackAsset=String(input.pay_currency||provider.pay_currency||'').trim().toLowerCase();
    const callbackNetwork=String(input.network||provider.network||provider.pay_network||'').trim().toLowerCase();
    if(!callbackAsset||!callbackNetwork)throw new HttpError(409,'Provider settlement asset or network is missing.');
    if(String(input.invoice_id)!==invoice||String(input.payment_id)!==payment||String(input.order_id)!==order)throw new HttpError(409,'Callback identity mismatch.');
    await sql`UPDATE funding_requests SET provider_pay_currency=${callbackAsset},provider_network=${callbackNetwork},reconciliation_status='provider_verified',provider_status='finished',updated_at=now() WHERE id=${order}`;
    const posted=await sql`SELECT reconcile_production_deposit(${order}::uuid,${payment},${invoice},${String(provider.payment_status)},${settled}::numeric,${fundingEventHash(provider)}) AS journal_id`;
    return res.status(200).json({received:true,credited:true,journalId:posted[0].journal_id,environment:'production'});
   }
  }
  if(!sandboxEnabled())throw new HttpError(503,'Sandbox callbacks are disabled.');
  if(!verifyIpn(input,req.headers['x-nowpayments-sig'],process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET))throw new HttpError(401,'Invalid callback signature.');
  const sandbox=await sql`SELECT id,provider_id FROM funding_requests WHERE id=${order} AND environment='sandbox'`;
  if(!sandbox.length||sandbox[0].provider_id!==invoice)throw new HttpError(409,'Callback does not match a known sandbox invoice.');
  await sql`INSERT INTO funding_events(event_hash,request_id,provider_payment_id,provider_status) VALUES(${fundingEventHash(input)},${order},${payment},${status}) ON CONFLICT DO NOTHING`;
  await sql`UPDATE funding_requests SET status='needs_review',updated_at=now() WHERE id=${order}`;
  return res.status(200).json({received:true,credited:false,environment:'sandbox'});
 }catch(error){return fail(res,error);}
}
