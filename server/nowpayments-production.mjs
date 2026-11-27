// Production credentials are separate from the legacy sandbox integration.
// This read-only adapter cannot create invoices, initiate payouts or credit balances.
import {HttpError} from './core.mjs';
export const productionCredentialsConfigured=()=>Boolean(process.env.NOWPAYMENTS_API_KEY?.trim()&&process.env.NOWPAYMENTS_IPN_SECRET?.trim());
export async function readProductionPayment(paymentId){
 if(!/^\d{1,40}$/.test(String(paymentId)))throw new HttpError(400,'Invalid provider payment identifier.');
 if(!productionCredentialsConfigured())throw new HttpError(503,'Production payment credentials are not configured.');
 const response=await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`,{headers:{'x-api-key':process.env.NOWPAYMENTS_API_KEY},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new HttpError(502,`Payment status lookup failed (HTTP ${response.status}).`);
 const data=await response.json();
 if(String(data.payment_id)!==String(paymentId))throw new HttpError(502,'Provider payment identity mismatch.');
 return data; // Internal evidence only, never a balance or permission to post a credit.
}
