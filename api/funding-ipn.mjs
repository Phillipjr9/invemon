import {headers,body,db,HttpError,fail} from '../server/core.mjs';
import {sandboxEnabled,verifyIpn,fundingEventHash} from '../server/funding.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
  if(!sandboxEnabled())throw new HttpError(503,'Sandbox callbacks are disabled.');
  const input=body(req,32000);
  if(!verifyIpn(input,req.headers['x-nowpayments-sig'],process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET))throw new HttpError(401,'Invalid callback signature.');
  const order=String(input.order_id||''),invoice=String(input.invoice_id||''),payment=String(input.payment_id||''),status=input.payment_status;
  const states=['waiting','confirming','confirmed','sending','partially_paid','finished','failed','refunded','expired'];
  if(!/^[a-f0-9-]{36}$/i.test(order)||!/^\d{1,40}$/.test(payment)||!states.includes(status))throw new HttpError(400,'Unsupported callback.');
  const sql=db();
  const rows=await sql`SELECT id,provider_id FROM funding_requests WHERE id=${order} AND environment='sandbox'`;
  if(!rows.length||rows[0].provider_id!==invoice)throw new HttpError(409,'Callback does not match a known sandbox invoice.');
  await sql`INSERT INTO funding_events(event_hash,request_id,provider_payment_id,provider_status) VALUES(${fundingEventHash(input)},${order},${payment},${status}) ON CONFLICT DO NOTHING`;
  // Callback is evidence only. Re-fetching provider status and amount/settlement reconciliation
  // are mandatory before any ledger credit. Out-of-order callbacks cannot complete a deposit.
  await sql`UPDATE funding_requests SET status='needs_review',updated_at=now() WHERE id=${order}`;
  return res.status(200).json({received:true,credited:false,environment:'sandbox'});
 }catch(error){return fail(res,error);}
}
