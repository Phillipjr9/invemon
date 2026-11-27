import { useState, type FormEvent } from 'react';
import { accountAction } from '../services/api';
import type { InvestmentAccount } from '../components/Dialogs';
import { COUNTRIES, RISK_BLUEPRINTS } from '../services/auth';
import { Wordmark } from './HomePage';
import './auth.css';
import './login.css';
import './login-editorial.css';

type Props = { register: boolean; onBack: () => void; onSwitch: () => void; onComplete: (account: InvestmentAccount) => void };
export default function ServerAuthPage({ register, onBack, onSwitch, onComplete }: Props) {
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [recover, setRecover] = useState(false), [notice, setNotice] = useState('');
 const [mfaRequired, setMfaRequired] = useState(false);
 const submit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault(); if (busy) return;
  const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError('');
  try { if (recover) { await accountAction('request-reset', {email:data.email}); setNotice('If an eligible account exists and delivery succeeds, a reset link will arrive shortly. Check spam too.'); return; } const result = await accountAction(register ? 'register' : 'login', data); if (result.mfaRequired) { setMfaRequired(true); setNotice('Enter your authenticator code or one unused recovery code to finish signing in.'); return; } if (!result.account) throw new Error('No account returned. Try again.'); onComplete(result.account); }
  catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); } finally { setBusy(false); }
 };
 return <div className="login-shell server-auth"><aside className="login-panel editorial-panel">
  <img className="login-editorial-photo" src="/assets/new-york-flatiron.jpg" alt="New York’s Flatiron Building, looking upward" />
  <header className="login-panel-top"><button type="button" onClick={onBack} aria-label="Back to website"><Wordmark light /></button></header>
  <div className="login-editorial-copy"><span className="login-editorial-kicker">A LONGER-TERM PERSPECTIVE</span><h2>Great things<br />are built<br /><em>over time.</em></h2><p>Your own space to explore a more considered approach.</p></div>
 </aside><main className="login-main"><div className="login-form-wrap"><section className="login-section">
  <span className="login-welcome">{register ? 'YOUR NEXT CHAPTER' : 'WELCOME BACK'}</span><h1>{recover ? 'Recover your account' : register ? 'Create your account' : 'Sign in to Invemon'}</h1>
  <p className="login-lede">Secure account access. The investment workspace remains a simulation—no real trades or transfers.</p>
  {error && <p className="login-alert is-error" role="alert">{error}</p>}
  {notice && <p role="status" className="login-alert">{notice}</p>}
  <form className="login-form" onSubmit={submit}>
   {register && <div className="login-field"><label htmlFor="server-name">Full name</label><input id="server-name" name="name" required minLength={2} maxLength={100} autoComplete="name" /></div>}
   <div className="login-field"><label htmlFor="server-email">Email address</label><input id="server-email" name="email" type="email" required maxLength={254} autoComplete="email" /></div>
   {!recover && <div className="login-field"><label htmlFor="server-password">Password</label><input id="server-password" name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} />{register && <small>12–128 characters. Use a unique password.</small>}</div>}
   {mfaRequired && !recover && !register && <div className="login-field"><label htmlFor="server-mfa">Authenticator or recovery code</label><input id="server-mfa" name="code" autoComplete="one-time-code" maxLength={40} required spellCheck={false} autoCapitalize="none" /></div>}
   {register && <><div className="login-field"><label htmlFor="server-country">Country of residence</label><select id="server-country" name="country">{COUNTRIES.map(country => <option key={country}>{country}</option>)}</select></div>
    <div className="login-field"><label htmlFor="server-risk">Investment risk profile</label><select id="server-risk" name="risk" defaultValue="Balanced">{RISK_BLUEPRINTS.map(risk => <option key={risk.id}>{risk.id}</option>)}</select></div>
    <div className="login-field"><label htmlFor="server-monthly">Illustrative monthly investment (USD)</label><input id="server-monthly" name="monthlyAmount" type="number" min="0" max="1000000" step="1" defaultValue="250" required /></div>
    <label className="login-remember"><input type="checkbox" required /> I understand this is a simulated investment workspace, not a funded investment account.</label></>}
   <button className="login-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : recover ? 'Send reset link' : register ? 'Create account' : 'Log in'}</button>
  </form>
  {!register && <button className="login-back" type="button" disabled={busy} onClick={() => { setRecover(!recover); setMfaRequired(false); setError(''); setNotice(''); }}>{recover ? 'Return to password sign-in' : 'Forgot your password?'}</button>}
  <p className="login-preview-note">Recovery and verification links require configured email delivery. Authenticator MFA is available in account security when configured. Social sign-in is not enabled.</p>
  <button className="login-back" type="button" disabled={busy} onClick={onSwitch}>{register ? 'Already registered? Sign in' : 'New to Invemon? Create an account'}</button>
  <button className="login-back" type="button" onClick={onBack}>Back to website</button>
 </section></div></main></div>;
}
