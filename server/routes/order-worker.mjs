import {headers,body,HttpError,fail} from '../core.mjs';
import {requireOperations} from '../operations.mjs';
import {runOrderWorker} from '../order-worker.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
  requireOperations(req);
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Expected JSON.');
  const input=body(req);
  if(!['dispatch','reconcile'].includes(input.mode)||!Number.isInteger(input.limit)||input.limit<1||input.limit>10)throw new HttpError(400,'Provide dispatch/reconcile mode and a batch limit of 1–10.');
  // Customer fields, URLs and provider names are not accepted as adapter config.
  if(Object.keys(input).some(key=>!['mode','limit'].includes(key)))throw new HttpError(400,'Unexpected worker configuration.');
  return res.status(200).json(await runOrderWorker({mode:input.mode,limit:input.limit}));
 }catch(error){return fail(res,error);}
}
