import { randomBytes } from 'node:crypto';
import { db, sha, HttpError, hashPassword, clearSession, rateLimit } from './core.mjs';
import { emailConfigured } from './notifications.mjs';

export async function requestAccountLink(req, purpose, email, user) {
 if (!emailConfigured()) throw new HttpError(503,'Account email is not configured. Please contact support.');
 const normalized = String(email || '').trim().toLowerCase();
 if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 254) throw new HttpError(400,'Enter a valid email address.');
 await rateLimit(req,`link-${purpose}`,5);
 // Separate email-scoped quota prevents spreading requests across IP addresses.
 await rateLimit({headers:{'x-forwarded-for':'email-quota'}},`link-${purpose}-${sha(normalized)}`,3);
 const sql = db();
 const rows = purpose === 'verify' ? [user] : await sql`SELECT id,email,email_verified_at FROM app_users WHERE email=${normalized}`;
 const target = rows[0];
 if (!target || (purpose === 'verify' && target.email_verified_at)) return;
 const raw = randomBytes(32).toString('hex'), digest = sha(raw);
 await sql`INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at)
 VALUES (${target.id},${purpose},${digest},now()+interval '30 minutes')
 ON CONFLICT(user_id,purpose) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now()`;
 const origin = new URL(process.env.APP_ORIGIN).origin;
 if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new HttpError(503,'Secure account origin is required.');
 const url = `${origin}/#${purpose}?token=${raw}`;
 const subject = purpose === 'reset' ? 'Reset your Invemon password' : 'Verify your Invemon email';
 try {
  const response = await fetch('https://api.resend.com/emails', {
   method:'POST', signal:AbortSignal.timeout(8000),
   headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`account-link-${digest}`},
   body:JSON.stringify({from:process.env.EMAIL_FROM,to:[target.email],subject,
    text:`${subject}\n\nOpen this single-use link within 30 minutes:\n${url}\n\nIf you did not request this, ignore this message. A new request replaces any previous link. Never share this link. Invemon is an investment simulation.`,
    html:`<h1>${subject}</h1><p>This single-use link expires in 30 minutes.</p><p><a href="${url}">${subject}</a></p><p>If you did not request this, ignore this message. A new request replaces any previous link. Never share this link.</p><p>Invemon is an investment simulation.</p>`}),
  });
  if (!response.ok || !(await response.json()).id) throw new Error('link_delivery_failed');
 } catch {
  await sql`DELETE FROM account_action_tokens WHERE token_hash=${digest}`;
  // Keep the same public response for registered/unregistered addresses or a provider failure.
  console.error('Account link email failed');
 }
}

export async function consumeAccountLink(purpose, token, password, res) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400,'This link is invalid or expired. Request a new one.');
 const sql = db(), digest = sha(token);
 const hash = purpose === 'reset' ? await hashPassword(password) : '';
 // Row deletion, user update and revocation commit together. DELETE serializes
 // concurrent consumers: only one request can obtain a live token's user_id.
 const result = purpose === 'reset'
  ? await sql`WITH consumed AS (DELETE FROM account_action_tokens WHERE token_hash=${digest} AND purpose='reset' AND expires_at>now() RETURNING user_id),
    changed AS (UPDATE app_users SET password_hash=${hash} WHERE id IN (SELECT user_id FROM consumed) RETURNING id),
    revoked AS (DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM changed))
    SELECT id FROM changed`
  : await sql`WITH consumed AS (DELETE FROM account_action_tokens WHERE token_hash=${digest} AND purpose='verify' AND expires_at>now() RETURNING user_id)
    UPDATE app_users SET email_verified_at=now() WHERE id IN (SELECT user_id FROM consumed) RETURNING id`;
 if (!result.length) throw new HttpError(400,'This link is invalid or expired. Request a new one.');
 if (purpose === 'reset') clearSession(res);
 return {ok:true};
}
