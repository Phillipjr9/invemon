import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './core.mjs';

export function requireOperations(req) {
 const secret=process.env.OPS_SECRET;
 if(!secret||secret.length<32)throw new HttpError(503,'Operations access is not configured.');
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(String(req.headers.authorization||''));
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new HttpError(401,'Unauthorized.');
}
export const REQUIRED_TABLES=['app_users','app_sessions','demo_workspaces','app_rate_limits','support_requests','security_events','email_preferences','email_outbox','account_action_tokens','support_messages'];
