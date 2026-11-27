import {headers,session,db,HttpError,fail} from '../core.mjs';
import {readLedgerActivity} from '../ledger-read.mjs';
// Read-only, session-scoped accounting balances. Never trusts client account IDs.
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed.');
  const user=await session(req);
  const params=new URL(req.url||'/api/balances','https://internal.invalid').searchParams;
  if(params.get('view')==='activity')return res.status(200).json(await readLedgerActivity(db(),user.id,params.get('before')));
  if(params.has('view'))throw new HttpError(400,'Unsupported balance view.');
  const balances=await db()`SELECT b.asset,b.total_units,b.reserved_units,b.available_units,a.decimals FROM ledger_spendable_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${user.id} AND b.kind='customer_liability' ORDER BY b.asset`;
  // No liability accounts/entries is a confirmed empty account, not a failed lookup.
  return res.status(200).json({balances:balances.map(b=>({asset:b.asset,units:b.total_units,reservedUnits:b.reserved_units,unreservedUnits:b.available_units,decimals:b.decimals})),source:'ledger',liveEnabled:false});
 }catch(error){return fail(res,error);}
}
