import { timingSafeEqual } from 'node:crypto';
import { headers, HttpError, fail } from '../server/core.mjs';
import { dispatchNotifications } from '../server/notifications.mjs';
export default async function handler(req,res) {
 headers(res);
 try {
  if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Method not allowed.');
  const secret=process.env.CRON_SECRET;
  if(!secret || secret.length<32)throw new HttpError(503,'Email retry worker is not configured.');
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(String(req.headers.authorization||''));
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new HttpError(401,'Unauthorized.');
  return res.status(200).json(await dispatchNotifications());
 }catch(error){return fail(res,error);}
}
