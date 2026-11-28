import './transaction-motion.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

type Preferences = { sign_in: boolean; support_received: boolean; workspace_saved: boolean };
type History = { id: string; type: string; status: string; created_at: string };
type Response = { configured: boolean; preferences: Preferences; history: History[] };
const labels: Record<string,string> = {welcome:'Welcome',sign_in:'New sign-in',password_changed:'Password changed',support_received:'Support acknowledgment',workspace_saved:'Archived workspace notification',preview:'Requested preview',trade_settled:'Internal crypto trade settled',withdrawal_requested:'Withdrawal requested',withdrawal_reviewing:'Withdrawal under review',withdrawal_approved:'Withdrawal approved—not paid',withdrawal_rejected:'Withdrawal rejected',withdrawal_cancelled:'Withdrawal cancelled'};
const statuses: Record<string,string> = {pending:'Queued',processing:'Sending',accepted:'Accepted by provider',failed:'Delivery attempt failed',expired:'Expired',skipped:'Skipped — opted out'};
export default function EmailNotifications({onDirtyChange}:{onDirtyChange?:(dirty:boolean)=>void}={}) {
 const [data,setData] = useState<Response | null>(null), [prefs,setPrefs] = useState<Preferences | null>(null);
 const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
 const dirty=Boolean(data&&prefs&&(data.preferences.sign_in!==prefs.sign_in||data.preferences.support_received!==prefs.support_received));
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
 const load = useCallback(async () => {
  try { const result = await api<Response>('notifications'); setData(result); setPrefs(result.preferences); setError(''); return true; }
  catch(err) { setError(err instanceof Error ? err.message : 'Unable to load notifications.'); return false; }
 }, []);
 useEffect(() => { void load(); },[load]);
 async function savePreferences() {
  if(busy || !prefs) return; setBusy(true); setError(''); setNotice('');
  try {
   await api('notifications','POST',{action:'preferences',preferences:prefs});
   setData(previous=>previous?{...previous,preferences:{...prefs}}:previous);
   setNotice('Email preferences saved.');
  } catch(err) { setError(err instanceof Error ? err.message : 'Request failed.'); } finally { setBusy(false); }
 }
 async function refresh(){
  if(busy)return;
  const changed=data&&prefs&&(data.preferences.sign_in!==prefs.sign_in||data.preferences.support_received!==prefs.support_received);
  if(changed&&!window.confirm('Discard unsaved email preferences and refresh?'))return;
  setBusy(true);setNotice('');try{await load();}finally{setBusy(false);}
 }

 return <section className="db-card db-span-4 transaction-flow"><div className="db-card-head"><h2>Email notifications</h2><span className="db-tag info">{data ? data.configured ? 'Provider configured' : 'Delivery not configured' : 'Account emails'}</span></div>
  <p className="db-small db-muted">Choose useful account updates. Welcome, password-change, settled-trade and withdrawal status notices are transactional messages, not marketing. Email preferences are separate from in-app reminders.</p>
  {data && !data.configured && <p className="db-small" style={{marginTop:12}}>Delivery is off until your administrator configures a verified sender and email provider.</p>}
  {error && <p role="alert" className="db-alert">{error}</p>}{notice && <p role="status" className="db-alert ok flow-success">{notice}</p>}
  {!data&&!error&&<p className="flow-pending" role="status">Loading email preferences…</p>}
  {prefs && <fieldset disabled={busy} style={{border:0,padding:0,margin:'18px 0'}}><legend className="db-small">Optional account emails</legend>{([
   ['sign_in','New sign-ins','A notice when your password is used to sign in. Off by default.'],
   ['support_received','Support acknowledgments','A receipt reference when you submit a support request.'],
  ] as const).map(([key,title,description]) => <label className="db-setting" key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={Boolean(prefs[key])} onChange={event=>setPrefs({...prefs,[key]:event.target.checked})} /></label>)}
   <button type="button" className="db-btn" disabled={busy} onClick={()=>void savePreferences()}>Save email preferences</button>
  </fieldset>}
  <div className="db-btn-row" style={{marginTop:18}}><button type="button" className="db-btn ghost" disabled={busy} onClick={()=>void refresh()}>Refresh email status</button></div>
  <p className="db-small db-muted" style={{marginTop:12}}>Accepted means the email provider accepted the message, not that it reached your inbox. Trade and withdrawal emails describe recorded internal events. Withdrawal approval is not payment. Open account activity for the latest status.</p>
  {data && <details style={{marginTop:20}}><summary>Recent email activity</summary>{data.history.length ? <ul className="db-list">{data.history.map(item=><li key={item.id}><div><strong>{labels[item.type] || 'Account email'}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div><span className="db-small">{statuses[item.status] || item.status}</span></li>)}</ul> : <p className="db-small db-muted" style={{marginTop:12}}>No email activity yet.</p>}</details>}
 </section>;
}
