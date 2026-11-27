import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api } from '../services/api';
import type { InvestmentAccount } from './Dialogs';

type Status = { enabled: boolean; configured: boolean; recoveryCodesRemaining: number };
type Result = { enabled?: boolean; secret?: string; uri?: string; recoveryCodes?: string[] };
export default function AuthenticatorSecurity({ account, onAccount }: { account: InvestmentAccount; onAccount: (account: InvestmentAccount | null) => void }) {
 const [status, setStatus] = useState<Status | null>(null), [pending, setPending] = useState<Result | null>(null);
 const [codes, setCodes] = useState<string[]>([]), [qr, setQr] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 useEffect(() => {
  let active = true;
  api<Status>('mfa', 'POST', { action: 'status' }).then(result => { if (active) setStatus(result); }).catch(err => { if (active) setError(err.message); });
  return () => { active = false; };
 }, []);
 useEffect(() => {
  let active = true; setQr('');
  if (pending?.uri) void QRCode.toDataURL(pending.uri, { width: 220, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (active) setQr(value); }).catch(() => { /* Manual setup key remains available. Never use an external QR service. */ });
  return () => { active = false; };
 }, [pending?.uri]);
 useEffect(() => {
  if (!codes.length && !pending) return;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
 }, [codes.length, pending]);
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (busy) return;
  const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  const action = button?.value || (pending ? 'confirm' : status?.enabled ? 'regenerate' : 'setup');
  if (action === 'disable' && !window.confirm('Disable authenticator protection? This signs out your other sessions and removes recovery codes.')) return;
  setBusy(true); setError(''); setNotice('');
  try {
   const result = await api<Result>('mfa', 'POST', { action, currentPassword: password, code });
   if (action === 'setup') { setPending(result); setNotice('Scan with your authenticator, then enter your current password and a generated code. Setup expires in 10 minutes.'); }
   else {
    const enabled = Boolean(result.enabled); setPending(null); setCodes(result.recoveryCodes || []);
    setStatus({ configured: true, enabled, recoveryCodesRemaining: result.recoveryCodes?.length || 0 });
    onAccount({ ...account, mfaEnabled: enabled });
    setNotice(enabled ? 'Authenticator protection updated. Other sessions have been signed out.' : 'Authenticator disabled. Other sessions have been signed out.');
   }
  } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update authenticator security.'); }
  finally { setBusy(false); setPassword(''); setCode(''); }
 }
 return <details className="authenticator-security" style={{ marginTop: 22 }}><summary>Authenticator &amp; recovery codes</summary>
  <p className="db-small db-muted" style={{ marginTop: 12 }}>An authenticator app adds a second sign-in factor. Password-reset emails do not remove it. Keep recovery codes somewhere safe outside this device.</p>
  {error && <p role="alert" className="db-alert">{error}</p>}{notice && <p role="status" className="db-alert ok">{notice}</p>}
  {!status ? <p className="db-small">{error ? 'Unable to read authenticator settings.' : 'Checking security settings…'}</p> : !status.configured ? <p className="db-small">Authenticator configuration is unavailable. An operator must configure the server encryption key. Existing protection is not bypassed.</p> : codes.length ? <div className="mfa-recovery"><h3>Save these recovery codes now</h3><p className="db-small">Each code works once. These codes will not be shown again. Anyone with your password and one code can sign in.</p><ul style={{ fontFamily: 'monospace', overflowWrap: 'anywhere', paddingLeft: 18 }}>{codes.map(value => <li key={value}>{value}</li>)}</ul><button className="db-btn" type="button" onClick={() => { setCodes([]); setNotice('Recovery codes hidden. Keep your saved copy private.'); }}>I have saved my recovery codes</button></div> : <>
   <p className="db-small" style={{ marginTop: 12 }}>Status: <strong>{status.enabled ? 'Enabled' : 'Not enabled'}</strong>{status.enabled ? ` · ${status.recoveryCodesRemaining} recovery codes remaining` : ''}</p>
   {!account.emailVerified && !status.enabled ? <p className="db-small">Verify your email before enabling an authenticator.</p> : <form className="dialog-form" onSubmit={event => void submit(event)}>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
     {pending && <div style={{ margin: '16px 0' }}><p className="db-small">Scan this QR code in an authenticator app. It is generated locally, not by an external image service.</p>{qr && <img src={qr} width={220} height={220} alt="Authenticator enrollment QR code containing your private setup key" style={{ maxWidth: '100%', height: 'auto' }} />}<p className="db-small">Or enter this private setup key manually:</p><code style={{ display: 'block', overflowWrap: 'anywhere', margin: '10px 0' }}>{pending.secret}</code></div>}
     <label className="db-field">Confirm password<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
     {(pending || status.enabled) && <label className="db-field">Current authenticator code<input type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>}
     <div className="db-btn-row" style={{ marginTop: 16 }}>
      {status.enabled ? <><button className="db-btn" type="submit" value="regenerate">Replace recovery codes</button><button className="db-btn" type="submit" value="disable">Disable authenticator</button></> : <button className="db-btn" type="submit" value={pending ? 'confirm' : 'setup'}>{pending ? 'Confirm authenticator' : 'Set up authenticator'}</button>}
      {pending && <button className="db-btn" type="button" onClick={() => { setPending(null); setPassword(''); setCode(''); }}>Hide setup key</button>}
     </div>
    </fieldset>
   </form>}
   <p className="db-small db-muted" style={{ marginTop: 12 }}>Codes cannot be reused, including during setup. Wait for the next 30-second code before another security change. Recovery codes work for sign-in, not for disabling protection. Losing both your authenticator and recovery codes can lock you out.</p>
  </>}
 </details>;
}
