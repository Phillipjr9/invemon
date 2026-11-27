import {db,randomUUID} from './core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reference=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=200&&!/[\x00-\x1f\x7f]/.test(value);
// INTERNAL ONLY. Adapters are trusted application objects, never request input.
// No provider is registered here; no cron, public dispatch route or live switch.
export async function dispatchOrder(orderId,adapter){
 if(!uuid.test(orderId)||!adapter||!reference(adapter.name)||typeof adapter.submit!=='function')throw new Error('Valid order and execution adapter required');
 const sql=db();
 const orders=await sql`SELECT o.id,q.operation,q.source_asset,q.source_units::text,q.fee_units::text,q.target_symbol,q.target_units::text,q.target_decimals,q.provider_quote_ref,q.expires_at FROM execution_orders o JOIN execution_quotes q ON q.id=o.quote_id WHERE o.id=${orderId}`;
 if(!orders.length)throw new Error('Order not found');
 const claimed=await sql`SELECT claim_execution_dispatch(${orderId}::uuid,${adapter.name}) AS claimed`;
 if(!claimed[0].claimed)return {state:'already_claimed',retrySubmission:false};
 try{
  // The durable claim commits before the external call. A crash after claim is
  // uncertain, NOT eligible for blind retry or automatic fund release.
  const result=await adapter.submit({...orders[0],executionKey:orderId});
  if(!reference(result?.providerOrderRef))throw new Error('Unverifiable provider acknowledgement');
  await sql`SELECT record_execution_dispatch(${randomUUID()}::uuid,${orderId}::uuid,${adapter.name},'submitted',${result.providerOrderRef})`;
  return {state:'submitted',filled:false};
 }catch{
  // Do not expose provider exceptions/credentials. Even a rejected response
  // requires reconciliation until a provider-specific verifier classifies it.
  await sql`SELECT record_execution_dispatch(${randomUUID()}::uuid,${orderId}::uuid,${adapter.name},'uncertain',NULL)`;
  return {state:'uncertain',retrySubmission:false};
 }
}
export async function reconcileOrderDispatch(orderId,adapter){
 if(!uuid.test(orderId)||!adapter||!reference(adapter.name)||typeof adapter.lookup!=='function')throw new Error('Valid order and reconciliation adapter required');
 const sql=db();
 const rows=await sql`SELECT execution_key FROM execution_dispatches WHERE order_id=${orderId} AND provider=${adapter.name}`;
 if(!rows.length)throw new Error('Dispatch not found');
 // Lookup must be non-mutating and use the same stable execution key. A
 // not-found response is not sufficient to release funds or retry submission.
 const result=await adapter.lookup({executionKey:rows[0].execution_key});
 if(!reference(result?.providerOrderRef))return {state:'unresolved',retrySubmission:false};
 await sql`SELECT record_execution_dispatch(${randomUUID()}::uuid,${orderId}::uuid,${adapter.name},'submitted',${result.providerOrderRef})`;
 return {state:'submitted',filled:false};
}
