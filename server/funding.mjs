import { createHmac,timingSafeEqual } from 'node:crypto';
import { HttpError,db,checkPassword,randomUUID,sha } from './core.mjs';
export function requireFundingAdmin(user){
 const ids=(process.env.FUNDING_ADMIN_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!user.email_verified_at||!user.mfa_secret||!user.mfa_verified||!ids.includes(user.id))throw new HttpError(403,'Funding administration requires authorized staff with verified email and MFA.');
}
export function sandboxEnabled(){return process.env.NOWPAYMENTS_SANDBOX_ENABLED==='true'&&!!process.env.NOWPAYMENTS_SANDBOX_API_KEY&&!!process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET;}
export function usdAmount(input){
 if(typeof input!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(input))throw new HttpError(400,'Enter a USD amount with at most two decimal places.');
 const [whole,fraction='']=input.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(cents<100n||cents>1000000n)throw new HttpError(400,'Sandbox amount must be between $1 and $10,000.');
 return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
}
export function validateBankInstructions(value){
 const fields=['beneficiary','bankName','accountNumber','routingOrSwift','currency','referenceInstructions'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))throw new HttpError(400,'Invalid bank instruction fields.');
 const result={};
 for(const field of fields){const text=value[field];if(typeof text!=='string'||!text.trim()||text.length>250||/[\x00-\x1f]/.test(text))throw new HttpError(400,`Invalid ${field}.`);result[field]=text.trim();}
 if(!/^[A-Z]{3}$/.test(result.currency))throw new HttpError(400,'Use a three-letter currency code.');
 return result;
}
export function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export function verifyIpn(value,signature,secret){
 if(!secret||typeof signature!=='string'||!/^[a-f0-9]{128}$/i.test(signature))return false;
 const digest=createHmac('sha512',secret).update(JSON.stringify(canonical(value))).digest();
 return timingSafeEqual(digest,Buffer.from(signature,'hex'));
}
export function providerInvoiceUrl(input){
 try{const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.port||!['sandbox.nowpayments.io','api-sandbox.nowpayments.io'].includes(url.hostname))throw new Error();return url.href;}
 catch{throw new HttpError(502,'Provider returned an unrecognized sandbox checkout URL.');}
}
export async function createSandboxInvoice(user,amount){
 if(!sandboxEnabled())throw new HttpError(503,'Sandbox crypto funding is not configured. Live deposits are disabled.');
 const origin=new URL(process.env.APP_ORIGIN);if(origin.protocol!=='https:')throw new HttpError(503,'An HTTPS application origin is required.');
 const sql=db(),id=randomUUID(),normalized=usdAmount(amount);
 await sql`INSERT INTO funding_requests(id,user_id,amount_usd) VALUES(${id},${user.id},${normalized})`;
 // No retry on ambiguous provider failures: it could create duplicate invoices.
 try{
  const response=await fetch('https://api-sandbox.nowpayments.io/v1/invoice',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','x-api-key':process.env.NOWPAYMENTS_SANDBOX_API_KEY},body:JSON.stringify({price_amount:Number(normalized),price_currency:'usd',order_id:id,order_description:'Invemon SANDBOX funding test — no investment balance credit',ipn_callback_url:`${origin.origin}/api/funding-ipn`,success_url:`${origin.origin}/#funding`,cancel_url:`${origin.origin}/#funding`})});
  if(!response.ok){
   const category=[401,403].includes(response.status)?'Check that sandbox credentials are used.':response.status===429?'Provider rate limit reached; wait before retrying.':'Check sandbox store configuration and request requirements.';
   throw new HttpError(502,`Sandbox payment provider rejected the request (HTTP ${response.status}). ${category}`);
  }
  const result=await response.json(),url=providerInvoiceUrl(result.invoice_url),providerId=String(result.id||'');
  if(!/^\d{1,40}$/.test(providerId))throw new HttpError(502,'Invalid sandbox invoice identifier.');
  await sql`UPDATE funding_requests SET provider_id=${providerId},invoice_url=${url},status='waiting',updated_at=now() WHERE id=${id}`;
  return {id,invoiceUrl:url,environment:'sandbox',credited:false};
 }catch(error){await sql`UPDATE funding_requests SET status='needs_review',updated_at=now() WHERE id=${id}`;throw error instanceof HttpError?error:new HttpError(502,'Sandbox request outcome is uncertain. Do not retry automatically.');}
}
export async function updateBankInstructions(user,input){
 requireFundingAdmin(user);
 if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password.');
 const instructions=validateBankInstructions(input.instructions),sql=db();
 // Serialize edits and reject stale revisions. Never publish instructions to customers yet.
 const rows=await sql`INSERT INTO bank_instruction_versions(previous_revision,instructions,updated_by)
 SELECT ${String(input.revision||'0')}::bigint,${JSON.stringify(instructions)}::jsonb,${user.id}
 WHERE COALESCE((SELECT max(revision) FROM bank_instruction_versions),0)=${String(input.revision||'0')}::bigint ON CONFLICT(previous_revision) DO NOTHING RETURNING revision,created_at`;
 if(!rows.length)throw new HttpError(409,'Bank instructions changed. Reload before editing.');
 return {revision:rows[0].revision,published:false};
}
export const fundingEventHash=value=>sha(JSON.stringify(canonical(value)));
