import { neon } from '@neondatabase/serverless';
import { randomBytes, randomUUID, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export { randomUUID };
export const sha = value => createHash('sha256').update(value).digest('hex');
export const db = () => {
 if (!process.env.DATABASE_URL) throw new HttpError(503, 'Account services are not configured. Guest demo remains available.');
 return neon(process.env.DATABASE_URL);
};
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-invemon-session' : 'invemon-session';
export function headers(res) {
 res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Type','application/json; charset=utf-8');
}
export function guard(req, methods) {
 if (!methods.includes(req.method)) throw new HttpError(405, 'Method not allowed.');
 if (req.method !== 'GET') {
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new HttpError(503, 'APP_ORIGIN must be configured before account services can accept requests.');
  if (req.headers.origin !== new URL(expected).origin) throw new HttpError(403, 'Request origin not allowed.');
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415,'Expected JSON.');
 }
}
export function body(req, maxBytes=16000) {
 let value;
 try { value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new HttpError(400, 'Invalid JSON.'); }
 if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value))>maxBytes) throw new HttpError(400, 'Invalid or oversized request.');
 return value;
}
export async function hashPassword(password) {
 if (typeof password !== 'string' || password.length<12 || password.length>128) throw new HttpError(400,'Use a password between 12 and 128 characters.');
 const salt=randomBytes(16).toString('hex');
 const hash=await scrypt(password,salt,64,{N:32768,maxmem:64*1024*1024});
 return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(password, stored) {
 if (typeof password!=='string' || password.length>128) return false;
 const [,salt,hex]=stored.split(':');
 const hash=await scrypt(password,salt,64,{N:32768,maxmem:64*1024*1024});
 const expected=Buffer.from(hex,'hex');return expected.length===hash.length && timingSafeEqual(hash,expected);
}
export function account(user) { return { ...user.profile, email:user.email, serverUserId:user.id, emailVerified:!!user.email_verified_at }; }
export async function session(req, required=true) {
 const token=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName()+'='))?.slice(cookieName().length+1);
 if (!token || !/^[a-f0-9]{64}$/.test(token)) { if(required)throw new HttpError(401,'Sign in to continue.'); return null; }
 const rows=await db()`SELECT u.*, s.token_hash FROM app_users u JOIN app_sessions s ON s.user_id=u.id WHERE s.token_hash=${sha(token)} AND s.expires_at>now()`;
 if(!rows[0] && required)throw new HttpError(401,'Your session expired. Sign in again.');
 return rows[0] || null;
}
export async function issueSession(res, userId) {
 const token=randomBytes(32).toString('hex');
 await db()`INSERT INTO app_sessions (token_hash,user_id,expires_at) VALUES (${sha(token)},${userId},now()+interval '7 days')`;
 res.setHeader('Set-Cookie',`${cookieName()}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);
}
export function clearSession(res) { res.setHeader('Set-Cookie',`${cookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`); }
export async function rateLimit(req, scope, limit=20) {
 // Vercel sets x-forwarded-for at its trusted ingress. Never accept a client
 // supplied IP from a custom reverse proxy without configuring that proxy.
 const ip=String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
 const key=sha(`${scope}:${ip}`);
 const rows=await db()`INSERT INTO app_rate_limits(key,hits,expires_at) VALUES (${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN app_rate_limits.expires_at<now() THEN 1 ELSE app_rate_limits.hits+1 END, expires_at=CASE WHEN app_rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE app_rate_limits.expires_at END RETURNING hits`;
 if(rows[0].hits>limit)throw new HttpError(429,'Too many requests. Try again in 15 minutes.');
}
export async function audit(userId, action) { await db()`INSERT INTO security_events(id,user_id,action) VALUES (${randomUUID()},${userId},${action})`; }
export function fail(res,error) {
 if (!(error instanceof HttpError)) console.error('Account API failure', { name:error.name, code:error.code });
 res.status(error instanceof HttpError?error.status:500).json({error:error instanceof HttpError?error.message:'The service could not complete your request. Please try again.'});
}
export function profile(input) {
 const name=String(input.name || '').trim();if(name.length<2||name.length>100)throw new HttpError(400,'Enter a name between 2 and 100 characters.');
 const monthly=Number(input.monthlyAmount ?? 250);
 if(!Number.isFinite(monthly)||monthly<0||monthly>1000000)throw new HttpError(400,'Monthly amount must be between 0 and 1,000,000 USD.');
 const risk=['Conservative','Balanced','Growth','Aggressive'].includes(input.risk)?input.risk:'Balanced';
 return {name,plan:'Free',risk,country:String(input.country || 'United States').slice(0,80),goal:String(input.goal || 'Long-term growth').slice(0,100),monthlyAmount:String(monthly)};
}
