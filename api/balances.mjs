import {headers,session,db,HttpError,fail} from '../server/core.mjs';
// Read-only, session-scoped accounting balances. Never trusts client account IDs.
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed.');
  const user=await session(req);
  const balances=await db()`SELECT b.asset,b.debit_units,a.decimals FROM ledger_account_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${user.id} AND b.kind='customer_liability' ORDER BY b.asset`;
  // No liability accounts/entries is a confirmed empty account, not a failed lookup.
  return res.status(200).json({balances:balances.map(b=>({asset:b.asset,units:(-BigInt(b.debit_units)).toString(),decimals:b.decimals})),source:'ledger',liveEnabled:false});
 }catch(error){return fail(res,error);}
}
