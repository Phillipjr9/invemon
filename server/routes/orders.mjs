import {db,headers,guard,session,body,HttpError,fail,rateLimit,checkPassword} from '../core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();await rateLimit(req,`orders-${user.id}`,req.method==='GET'?120:20);
  if(req.method==='GET'){
   const orders=await sql`SELECT o.id,o.created_at,q.operation,q.source_asset,q.source_units::text,q.fee_units::text,a.decimals AS source_decimals,q.target_symbol,q.target_units::text,q.target_decimals,
    CASE WHEN EXISTS(SELECT 1 FROM execution_order_events e WHERE e.order_id=o.id AND e.state='cancelled') THEN 'cancelled' WHEN EXISTS(SELECT 1 FROM execution_dispatch_events d WHERE d.order_id=o.id AND d.state='submitted') THEN 'submitted' WHEN EXISTS(SELECT 1 FROM execution_dispatch_events d WHERE d.order_id=o.id AND d.state='uncertain') THEN 'uncertain' WHEN EXISTS(SELECT 1 FROM execution_dispatches d WHERE d.order_id=o.id) THEN 'dispatch_pending' ELSE 'queued' END AS state
    FROM execution_orders o JOIN execution_quotes q ON q.id=o.quote_id JOIN ledger_assets a ON a.code=q.source_asset WHERE o.user_id=${user.id} ORDER BY o.created_at DESC,o.id DESC LIMIT 100`;
   const accounts=await sql`SELECT b.asset,b.available_units,a.decimals FROM ledger_spendable_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${user.id} ORDER BY b.asset`;
   return res.status(200).json({orders,accounts,executionEnabled:false,quoteEnabled:false,limit:100,notice:'No execution adapter connected. Quotes are not fills; queued orders are not holdings.'});
  }
  const input=body(req);
  if(!['quote','accept','cancel'].includes(input.action))throw new HttpError(400,'Unsupported order action.');
  if(input.action==='quote'){
   if(!['crypto_buy','crypto_sell','crypto_swap','stock_buy'].includes(input.operation)||typeof input.sourceAsset!=='string'||input.sourceAsset.length>80||typeof input.targetSymbol!=='string'||!/^[A-Z0-9][A-Z0-9:._-]{0,79}$/.test(input.targetSymbol)||typeof input.amount!=='string'||!/^\d{1,48}(\.\d{1,30})?$/.test(input.amount)||!/[1-9]/.test(input.amount))throw new HttpError(400,'Provide an operation, source asset, destination symbol and positive decimal amount.');
   throw new HttpError(503,'Live quotes are unavailable. An approved execution/liquidity adapter must be connected first. No order or fund reservation was created.');
  }
  if(input.action==='accept'){
   // Deliberately not an environment-only switch: adapter validation, durable
   // dispatch and independently reconciled fills must exist before acceptance.
   throw new HttpError(503,'Live order submission is unavailable. No execution adapter is connected.');
  }
  if(typeof input.id!=='string'||!uuid.test(input.id))throw new HttpError(400,'Invalid order ID.');
  if(!user.email_verified_at||!user.mfa_secret||!user.mfa_verified)throw new HttpError(403,'Verified email and an MFA-verified session are required.');
  if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password.');
  await sql`SELECT cancel_execution_order(${input.id}::uuid,${user.id}::uuid)`;
  return res.status(200).json({cancelled:true});
 }catch(error){
  if(error.code==='P0002')return fail(res,new HttpError(404,'Order not found.'));
  if(error.code==='40001')return fail(res,new HttpError(409,'Order state changed. Refresh before cancelling.'));
  return fail(res,error);
 }
}
