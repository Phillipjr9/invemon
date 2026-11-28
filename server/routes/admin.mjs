import {requireAdmin} from '../admin-roles.mjs';
import {attemptUserNotifications} from '../notifications.mjs';
import {inventoryView,inventoryChange} from '../admin-inventory.mjs';
import {db,headers,guard,session,body,HttpError,fail,rateLimit,checkPassword,randomUUID} from '../core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req);const role=requireAdmin(user);
  await rateLimit(req,`admin-${user.id}`,req.method==='GET'?120:20);const sql=db();
  if(req.method==='GET'){
   const view=req.query?.view||'queue';
   if(view==='deposits'){
    const deposits=await sql`SELECT f.id,f.user_id,f.amount_usd::text,f.status,f.provider_id,f.provider_payment_id,f.provider_status,f.reconciliation_status,f.credited_journal_id,f.created_at,f.updated_at,
     (SELECT count(*)::int FROM funding_events e WHERE e.request_id=f.id) AS callback_count,
     CASE WHEN f.credited_journal_id IS NOT NULL AND f.provider_status='refunded' THEN 'refund_after_credit'
      WHEN f.credited_journal_id IS NOT NULL THEN 'credited'
      WHEN f.provider_status='finished' THEN 'settled_without_credit'
      WHEN f.updated_at<now()-interval '24 hours' THEN 'stale_uncredited'
      ELSE 'pending' END AS attention
     FROM funding_requests f WHERE f.environment='production' ORDER BY f.created_at DESC,f.id DESC LIMIT 100`;
    return res.status(200).json({deposits,limit:100,readOnly:true});
   }
   if(view==='inventory')return res.status(200).json(await inventoryView(sql));
   if(view==='orders'){
    const orders=await sql`SELECT o.id,o.created_at,u.email,q.operation,q.provider,q.source_asset,q.source_units::text,q.fee_units::text,a.decimals,q.target_symbol,
     d.claimed_at,
     CASE WHEN EXISTS(SELECT 1 FROM execution_order_events e WHERE e.order_id=o.id AND e.state='cancelled') THEN 'cancelled' WHEN EXISTS(SELECT 1 FROM execution_settlements s WHERE s.order_id=o.id AND s.outcome='filled') THEN 'settled_filled' WHEN EXISTS(SELECT 1 FROM execution_settlements s WHERE s.order_id=o.id AND s.outcome='cancelled_partial') THEN 'settled_partial' WHEN EXISTS(SELECT 1 FROM execution_fills f WHERE f.order_id=o.id) THEN 'fills_pending_settlement' WHEN EXISTS(SELECT 1 FROM execution_dispatch_events e WHERE e.order_id=o.id AND e.state='submitted') THEN 'submitted' WHEN EXISTS(SELECT 1 FROM execution_dispatch_events e WHERE e.order_id=o.id AND e.state='uncertain') THEN 'uncertain' WHEN d.order_id IS NOT NULL THEN 'dispatch_pending' WHEN q.expires_at<=now() THEN 'quote_expired' ELSE 'queued' END AS state,
     r.state AS funds_state
     FROM execution_orders o JOIN app_users u ON u.id=o.user_id JOIN execution_quotes q ON q.id=o.quote_id JOIN ledger_assets a ON a.code=q.source_asset JOIN fund_reservation_states r ON r.id=o.id LEFT JOIN execution_dispatches d ON d.order_id=o.id
     ORDER BY o.created_at DESC,o.id DESC LIMIT 100`;
    return res.status(200).json({orders,limit:100,manualFillEnabled:false});
   }
   if(view==='customers'){
    const search=String(req.query?.search||'').trim();if(search.length<3||search.length>100)throw new HttpError(400,'Search using 3–100 characters of an email or account ID.');
    const customers=await sql`SELECT id,email,email_verified_at,created_at FROM app_users WHERE strpos(lower(email),lower(${search}))>0 OR id::text=${search} ORDER BY created_at DESC,id DESC LIMIT 30`;
    return res.status(200).json({customers,limit:30});
   }
   if(view==='account'){
    const id=req.query?.id;if(typeof id!=='string'||!uuid.test(id))throw new HttpError(400,'Invalid account ID.');
    const customers=await sql`SELECT id,email,email_verified_at,created_at FROM app_users WHERE id=${id}`;
    if(!customers.length)throw new HttpError(404,'Account not found.');
    const balances=await sql`SELECT b.asset,b.total_units,b.reserved_units,b.available_units,a.decimals FROM ledger_spendable_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${id} ORDER BY b.asset`;
    return res.status(200).json({customer:customers[0],balances});
   }
   if(view==='history'){
    const id=req.query?.id;if(typeof id!=='string'||!uuid.test(id))throw new HttpError(400,'Invalid reservation ID.');
    const events=await sql`SELECT id,reservation_id,revision,actor_id,decision,note,created_at FROM admin_review_events WHERE reservation_id=${id} ORDER BY revision DESC LIMIT 50`;
    return res.status(200).json({events,limit:50});
   }
   if(view!=='queue')throw new HttpError(400,'Invalid admin view.');
   const requests=await sql`SELECT r.id,r.user_id,u.email,r.asset,r.units::text,a.decimals,r.state,r.created_at,d.label AS destination_label,d.masked AS destination_masked,d.kind AS destination_kind,coalesce(e.revision,0) AS revision,coalesce(e.decision,'pending') AS decision
    FROM fund_reservation_states r LEFT JOIN withdrawal_requests w ON w.id=r.id LEFT JOIN withdrawal_destinations d ON d.id=w.destination_id JOIN app_users u ON u.id=r.user_id JOIN ledger_assets a ON a.code=r.asset
    LEFT JOIN LATERAL(SELECT revision,decision FROM admin_review_events WHERE reservation_id=r.id ORDER BY revision DESC LIMIT 1)e ON true
    WHERE r.purpose='withdrawal' ORDER BY r.created_at DESC,r.id DESC LIMIT 100`;
   return res.status(200).json({requests,limit:100,payoutsEnabled:false,role});
  }
  const input=body(req);if(input.action==='inventory'){requireAdmin(user,{superOnly:true});return res.status(200).json(await inventoryChange(sql,user,input));}
  if(input.action!=='review')throw new HttpError(400,'Unsupported admin action.');
  if(typeof input.id!=='string'||!uuid.test(input.id)||!Number.isInteger(input.revision)||input.revision<0||!['reviewing','approved','rejected'].includes(input.decision)||typeof input.note!=='string'||input.note.trim().length<1||input.note.length>2000)throw new HttpError(400,'Provide a request, revision, decision and a note of 1–2,000 characters.');
  if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password for this admin action.');
  try{
   const result=await sql`SELECT admin_review_withdrawal(${randomUUID()}::uuid,${input.id}::uuid,${user.id}::uuid,${input.revision},${input.decision},${input.note.trim()}) AS revision`;
   try{
    const recipients=await sql`SELECT user_id FROM withdrawal_requests WHERE id=${input.id}`;
    if(recipients[0])await attemptUserNotifications(recipients[0].user_id);
   }catch(error){console.error('Withdrawal email dispatch deferred',{code:error.code});}
   return res.status(200).json({revision:result[0].revision,payoutInitiated:false});
  }catch(error){
   if(error.code==='40001')throw new HttpError(409,'This request changed or is no longer held. Reload before reviewing.');
   if(error.code==='P0002')throw new HttpError(404,'Withdrawal request not found.');
   throw error;
  }
 }catch(error){return fail(res,error);}
}
