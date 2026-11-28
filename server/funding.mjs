import {requireAdmin} from './admin-roles.mjs';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { HttpError,db,checkPassword,randomUUID,sha } from './core.mjs';
import { productionCredentialsConfigured } from './nowpayments-production.mjs';
export const requireFundingAdmin=user=>requireAdmin(user);
export function sandboxEnabled(){return process.env.NOWPAYMENTS_SANDBOX_ENABLED==='true'&&!!process.env.NOWPAYMENTS_SANDBOX_API_KEY&&!!process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET;}
export function liveDepositsEnabled(){return process.env.NOWPAYMENTS_LIVE_DEPOSITS_ENABLED==='true'&&productionCredentialsConfigured();}
export function usdAmount(input){
 if(typeof input!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(input))throw new HttpError(400,'Enter a USD amount with at most two decimal places.');
 const [whole,fraction='']=input.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(cents<100n||cents>1000000n)throw new HttpError(400,'Sandbox amount must be between $1 and $10,000.');
 return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
}
export function validateBankInstructions(value){
 if(value?.schemaVersion===2)return validateUSBankInstructions(value);
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
export async function createProductionInvoice(user,amount){
 if(!liveDepositsEnabled())throw new HttpError(503,'Live deposits are not enabled.');
 const origin=new URL(process.env.APP_ORIGIN||'');if(origin.protocol!=='https:')throw new HttpError(503,'An HTTPS application origin is required.');
 const sql=db(),id=randomUUID(),normalized=usdAmount(amount);
 await sql`INSERT INTO funding_requests(id,user_id,amount_usd,environment,status) VALUES(${id},${user.id},${normalized},'production','creating')`;
 try{
  const response=await fetch('https://api.nowpayments.io/v1/invoice',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','x-api-key':process.env.NOWPAYMENTS_API_KEY},body:JSON.stringify({price_amount:Number(normalized),price_currency:'usd',order_id:id,order_description:'Invemon USD account funding',ipn_callback_url:`${origin.origin}/api/funding-ipn`,success_url:`${origin.origin}/#funding`,cancel_url:`${origin.origin}/#funding`})});
  if(!response.ok){throw new HttpError(502,`Payment provider rejected the invoice (HTTP ${response.status}).`);}
  const result=await response.json(),url=providerInvoiceUrlForProduction(result.invoice_url),providerId=String(result.id||'');
  if(!/^\d{1,40}$/.test(providerId))throw new HttpError(502,'Invalid production invoice identifier.');
  await sql`UPDATE funding_requests SET provider_id=${providerId},invoice_url=${url},status='waiting',updated_at=now() WHERE id=${id}`;
  return {id,invoiceUrl:url,environment:'production',credited:false};
 }catch(error){await sql`UPDATE funding_requests SET status='needs_review',updated_at=now() WHERE id=${id}`;throw error instanceof HttpError?error:new HttpError(502,'Production invoice outcome is uncertain. Do not retry automatically.');}
}
export function providerInvoiceUrlForProduction(input){try{const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname!=='nowpayments.io')throw new Error();return url.href;}catch{throw new HttpError(502,'Provider returned an unrecognized production checkout URL.');}}
export async function updateBankInstructions(user,input){
 requireAdmin(user,{superOnly:true});
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
export function validateProductionSettlement({requestAmount,callbackStatus,providerStatus,callbackOrder,callbackInvoice,callbackPayment,providerOrder,providerInvoice,providerPayment,priceAmount,priceCurrency,purchaseAmount,purchaseCurrency,payCurrency,payNetwork}){
 if(callbackStatus!==providerStatus||providerStatus!== 'finished')throw new HttpError(202,'Payment is not in a final settled state.');
 if(callbackOrder!==providerOrder||callbackInvoice!==providerInvoice||callbackPayment!==providerPayment)throw new HttpError(409,'Provider order, invoice or payment identity mismatch.');
 const amount=Number(priceAmount),purchase=Number(purchaseAmount??priceAmount);
 if(!Number.isFinite(amount)||Math.abs(amount-requestAmount)>0.000001||!Number.isFinite(purchase)||Math.abs(purchase-requestAmount)>0.000001)throw new HttpError(409,'Provider amount mismatch.');
 if(String(priceCurrency||'usd').toLowerCase()!=='usd'||String(purchaseCurrency||'usd').toLowerCase()!=='usd')throw new HttpError(409,'Provider currency mismatch.');
 if(!payCurrency||typeof payCurrency!=='string'||payCurrency.trim().length<2||payCurrency.length>20)throw new HttpError(409,'Provider settlement asset is missing.');
 if(!payNetwork||typeof payNetwork!=='string'||payNetwork.trim().length<2||payNetwork.length>80)throw new HttpError(409,'Provider settlement network is missing.');
 return {settledAmount:amount,payCurrency:payCurrency.trim().toLowerCase(),payNetwork:payNetwork.trim().toLowerCase()};
}

export function validateUSBankInstructions(value){
 const required=['beneficiary','beneficiaryAddress','bankName','bankAddress','accountNumber','accountType','currency','referenceInstructions','methods'];
 const optional=['achRouting','wireRouting','swift','intermediaryBank','intermediaryRouting','intermediaryAccount','fbo','additionalInstructions'];
 const allowed=['schemaVersion',...required,...optional];
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw new HttpError(400,'Invalid bank instruction fields.');
 const result={schemaVersion:2};
 for(const key of [...required,...optional]){
  const text=value[key]??'';
  if(typeof text!=='string'||text.length>500||/[\x00-\x1f]/.test(text)||required.includes(key)&&!text.trim())throw new HttpError(400,`Invalid ${key}.`);
  result[key]=text.trim();
 }
 if(result.currency!=='USD'||!['checking','savings'].includes(result.accountType)||!['ach','wire','both'].includes(result.methods))throw new HttpError(400,'Select USD, account type and transfer methods.');
 if(!/^\d{4,17}$/.test(result.accountNumber))throw new HttpError(400,'Account number must contain 4–17 digits.');
 for(const [key,needed] of [['achRouting',result.methods!=='wire'],['wireRouting',result.methods!=='ach'],['intermediaryRouting',false]]){
  const routing=result[key];
  if(!routing&&!needed)continue;
  if(!/^\d{9}$/.test(routing)||/^0+$/.test(routing)||[...routing].reduce((sum,d,i)=>sum+Number(d)*[3,7,1][i%3],0)%10!==0)throw new HttpError(400,`Invalid ${key}: enter a nine-digit ABA routing number with a valid checksum.`);
 }
 if(result.swift&&!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(result.swift))throw new HttpError(400,'Invalid SWIFT/BIC.');
 if((result.intermediaryRouting||result.intermediaryAccount)&&!result.intermediaryBank)throw new HttpError(400,'Enter the intermediary bank name.');
 return result;
}
