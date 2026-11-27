import { useState, type FormEvent } from 'react';
import type { InvestmentAccount } from './Dialogs';
import { accountAction, downloadJson } from '../services/api';
import { COUNTRIES, RISK_BLUEPRINTS } from '../services/auth';

type Props = { account: InvestmentAccount; onAccount: (account: InvestmentAccount | null) => void; onSignedOut: () => void };
export default function ServerAccountTools({ account, onAccount, onSignedOut }: Props) {
 const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
 async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Request failed.'); } finally { setBusy(false); } }
 function submit(event: FormEvent<HTMLFormElement>, action: string) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  if (action === 'delete' && !window.confirm('Permanently delete your account, cloud simulation data, sessions, and support requests? This cannot be undone.')) return;
  void run(async () => {
   const result = await accountAction(action, data);
   if (action === 'profile' && result.account) { onAccount(result.account); setNotice('Profile saved. Your allocation policy now follows this risk profile.'); }
   if (action === 'password' || action === 'delete') {
    if (action === 'delete') { try { localStorage.removeItem(`invemon-dashboard:${account.email}`); localStorage.removeItem(`invemon-crypto-watchlist:${account.email.toLowerCase()}`); } catch { /* Cloud data is already deleted. */ } }
    onAccount(null); onSignedOut();
   }
   if (action === 'support') setNotice(`Support request saved: ${result.id}. ${result.emailStatus || 'Email acknowledgment status is available in Email notifications.'} This is not an emergency support channel.`);
  });
 }
 return <section className="db-card db-span-4"><div className="db-card-head"><h2>Account &amp; security</h2></div>
  <p className="db-small db-muted">Signed in as {account.email}. Email {account.emailVerified ? 'verified' : 'unverified'}. Live investing is disabled. Never submit identity documents, card details, or wallet secrets.</p>
  {error && <p role="alert" className="db-alert">{error}</p>}{notice && <p role="status" className="db-alert ok">{notice}</p>}
  <fieldset disabled={busy} style={{ border: 0, padding: 0, marginTop: 20 }}>
   {!account.emailVerified && <button type="button" className="db-btn" onClick={() => void run(async () => { await accountAction('request-verification'); setNotice('Verification link requested. If delivery succeeds, check your inbox. Links expire in 30 minutes.'); })}>Send email verification link</button>}
   <form className="dialog-form" onSubmit={event => submit(event, 'profile')}>
    <label className="db-field">Full name<input name="name" defaultValue={account.name} required minLength={2} maxLength={100} autoComplete="name" /></label>
    <label className="db-field">Country<select name="country" defaultValue={account.country || 'United States'}>{COUNTRIES.map(country => <option key={country}>{country}</option>)}</select></label>
    <label className="db-field">Risk profile<select name="risk" defaultValue={account.risk || 'Balanced'}>{RISK_BLUEPRINTS.map(risk => <option key={risk.id}>{risk.id}</option>)}</select></label>
    <input type="hidden" name="goal" value={account.goal || ''} /><input type="hidden" name="monthlyAmount" value={account.monthlyAmount || '250'} />
    <button className="db-btn" type="submit">Save profile</button>
   </form>
   <details style={{ marginTop: 20 }}><summary>Change password</summary><form className="dialog-form" onSubmit={event => submit(event, 'password')}>
    <label className="db-field">Current password<input type="password" name="currentPassword" required autoComplete="current-password" maxLength={128} /></label>
    <label className="db-field">New password<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    <p className="db-small db-muted">Changing your password signs out all devices, including this one.</p><button className="db-btn" type="submit">Change password &amp; sign out</button>
   </form></details>
   <div className="db-btn-row" style={{ marginTop: 20 }}>
    <button type="button" className="db-btn" onClick={() => void run(async () => { await accountAction('logout-all'); onAccount(null); onSignedOut(); })}>Sign out all devices</button>
    <button type="button" className="db-btn" onClick={() => void run(async () => { const data = await accountAction('export'); downloadJson('invemon-account-export.json', data); setNotice('Account export downloaded. Simulation only—not a tax statement.'); })}>Export account data</button>
   </div>
   <details style={{ marginTop: 20 }}><summary>Contact support</summary><form className="dialog-form" onSubmit={event => submit(event, 'support')}>
    <label className="db-field">Subject<input name="subject" required minLength={3} maxLength={120} /></label><label className="db-field">Message<textarea name="message" required minLength={10} maxLength={4000} /></label><button type="submit" className="db-btn">Submit support request</button>
   </form></details>
   <details style={{ marginTop: 20 }}><summary>Delete account permanently</summary><form className="dialog-form" onSubmit={event => submit(event, 'delete')}>
    <label className="db-field">Confirm current password<input name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" /></label><button type="submit" className="db-btn">Delete my account and cloud data</button>
   </form></details>
  </fieldset>
 </section>;
}
