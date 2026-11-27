import {db} from './core.mjs';
import {dispatchOrder,reconcileOrderDispatch} from './order-dispatch.mjs';
import {executionAdapters} from './execution-adapters.mjs';
// Internal injection is for reviewed adapters and local tests, never HTTP input.
export async function runOrderWorker({mode='reconcile',limit=5,adapters=executionAdapters}={}){
 if(!['dispatch','reconcile'].includes(mode)||!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Invalid worker mode or batch size');
 const names=Object.keys(adapters).filter(name=>Object.hasOwn(adapters,name)&&adapters[name]?.name===name&&typeof adapters[name]?.[mode==='dispatch'?'submit':'lookup']==='function');
 if(!names.length)return {enabled:false,processed:0,results:[]};
 const sql=db(),results=[];
 // No transactions span network calls. Dispatch's durable claim serializes
 // competing workers/cancellations; lookup is safe to repeat, submit is not.
 const candidates=mode==='dispatch'
 ?await sql`SELECT o.id,q.provider FROM execution_orders o JOIN execution_quotes q ON q.id=o.quote_id JOIN fund_reservation_states r ON r.id=o.id WHERE q.provider=ANY(${names}::text[]) AND q.expires_at>now() AND r.state='held' AND NOT EXISTS(SELECT 1 FROM execution_dispatches d WHERE d.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM execution_order_events e WHERE e.order_id=o.id AND e.state='cancelled') ORDER BY o.created_at,o.id LIMIT ${limit}`
 :await sql`SELECT d.order_id AS id,d.provider FROM execution_dispatches d WHERE d.provider=ANY(${names}::text[]) AND d.claimed_at<now()-interval '30 seconds' AND NOT EXISTS(SELECT 1 FROM execution_dispatch_events e WHERE e.order_id=d.order_id AND e.state='submitted') ORDER BY d.claimed_at,d.order_id LIMIT ${limit}`;
 for(const order of candidates){
  try{const result=await (mode==='dispatch'?dispatchOrder:reconcileOrderDispatch)(order.id,adapters[order.provider]);results.push({id:order.id,state:result.state});}
  catch{results.push({id:order.id,state:'needs_review'});}
 }
 return {enabled:true,processed:results.length,results};
}
