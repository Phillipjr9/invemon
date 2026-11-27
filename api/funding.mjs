import {productionCredentialsConfigured} from '../server/nowpayments-production.mjs';
import {headers,guard,session,body,rateLimit,db,HttpError,fail} from '../server/core.mjs';
import {requireFundingAdmin,updateBankInstructions} from '../server/funding.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();
  if(req.method==='GET'){
   const requests=await sql`SELECT id,environment,amount_usd,status,invoice_url,created_at FROM funding_requests WHERE user_id=${user.id} AND environment <> 'sandbox' ORDER BY created_at DESC LIMIT 30`;
   return res.status(200).json({environment:'production',liveEnabled:false,configured:productionCredentialsConfigured(),requests});
  }
  await rateLimit(req,`funding-${user.id}`,10);const input=body(req);
  if(input.action==='bank-status'){
   requireFundingAdmin(user);const rows=await sql`SELECT revision,instructions,created_at FROM bank_instruction_versions ORDER BY revision DESC LIMIT 1`;
   return res.status(200).json({bank:rows[0]||null,published:false});
  }
  if(input.action==='bank-update')return res.status(200).json(await updateBankInstructions(user,input));
  if(input.action==='create-invoice'){
   throw new HttpError(503,'Deposits are not open. Settlement reconciliation and account-ledger crediting must be verified before accepting funds.');
  }
  throw new HttpError(400,'Unsupported funding action. Live funding and withdrawals remain disabled.');
 }catch(error){return fail(res,error);}
}
