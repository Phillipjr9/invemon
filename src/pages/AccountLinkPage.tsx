import { useEffect, useState, type FormEvent } from 'react';
import { accountAction } from '../services/api';

export default function AccountLinkPage({ purpose, onLogin }: { purpose: 'reset' | 'verify'; onLogin: () => void }) {
 const [token] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '');
 const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
 // Fragments are not sent to the server. Remove the secret from browser history
 // before rendering any third-party chart or asset UI; consumption requires POST.
 useEffect(() => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${purpose}`); }, [purpose]);
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (busy) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (purpose === 'reset' && data.password !== data.confirm) { setError('Passwords do not match.'); return; }
  setBusy(true); setError('');
  try { await accountAction(purpose === 'reset' ? 'reset-password' : 'verify-email', {token,password:data.password}); setDone(true); }
  catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete this request.'); }
  finally { setBusy(false); }
 }
 return <main className="login-main"><section className="login-form-wrap"><h1>{purpose === 'reset' ? 'Set a new password' : 'Verify your email'}</h1>
  {done ? <p role="status">{purpose === 'reset' ? 'Password updated. All existing sessions were signed out.' : 'Your email address is verified. Sign in or refresh account settings to see the updated status.'}</p> : !token ? <p role="alert">This link is missing its token. Request a new link from sign-in or account settings.</p> : <form className="login-form" onSubmit={submit}>
   <p>Links expire after 30 minutes and can be used only once.</p>
   {purpose === 'reset' && <><label className="login-field">New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label className="login-field">Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label></>}
   <button type="submit" className="login-primary" disabled={busy}>{busy ? 'Please wait…' : purpose === 'reset' ? 'Update password' : 'Verify email address'}</button>
  </form>}
  {error && <p role="alert" className="login-alert is-error">{error}</p>}<button className="login-back" onClick={onLogin}>Back to sign in</button>
 </section></main>;
}
