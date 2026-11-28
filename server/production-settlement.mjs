import {HttpError} from './core.mjs';
const reject=message=>{throw new HttpError(409,message);};
function decimal(value,scale){
 const text=String(value??'');
 if(!/^\d+(\.\d+)?$/.test(text))reject('Missing or invalid settlement amount.');
 const [whole,fraction='']=text.split('.');
 if(fraction.length>scale&&/[1-9]/.test(fraction.slice(scale)))reject('Settlement amount precision mismatch.');
 return BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.slice(0,scale).padEnd(scale,'0'));
}
function token(value){return typeof value==='string'?value.trim().toLowerCase():'';}
export function verifyProductionSettlement(request,callback,provider){
 if(callback.payment_status!=='finished'||provider.payment_status!=='finished')reject('Payment is not independently settled.');
 for(const [field,expected] of [['order_id',request.id],['invoice_id',request.provider_id],['payment_id',callback.payment_id]]){
  if(expected==null||String(expected)===''||provider[field]==null||callback[field]==null||String(provider[field])!==String(expected)||String(callback[field])!==String(expected))reject('Provider order, invoice or payment identity mismatch.');
 }
 if(request.provider_payment_id&&String(request.provider_payment_id)!==String(provider.payment_id))reject('Payment binding mismatch.');
 const cents=decimal(request.amount_usd,2);
 if(cents<=0n)reject('Invalid request amount.');
 for(const evidence of [callback,provider]){
  if(token(evidence.price_currency)!=='usd')reject('Provider currency mismatch.');
  if(decimal(evidence.price_amount,2)!==cents)reject('Provider amount mismatch.');
 }
 const asset=token(provider.pay_currency),network=token(provider.network||provider.pay_network);
 if(!asset||!network||token(callback.pay_currency)!==asset||token(callback.network||callback.pay_network)!==network)reject('Settlement asset or network mismatch or missing.');
 if(request.requested_asset&&token(request.requested_asset)!==asset)reject('Requested asset mismatch.');
 if(request.requested_network&&token(request.requested_network)!==network)reject('Requested network mismatch.');
 // Invoice price is not payment evidence: require independent actual-paid units.
 const due=decimal(provider.pay_amount,30),paid=decimal(provider.actually_paid,30);
 if(due<=0n||paid<due)reject('Provider payment is incomplete.');
 return {amount:(cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0'),asset,network};
}
