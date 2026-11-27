import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

type Preferences = { sign_in: boolean; support_received: boolean; workspace_saved: boolean };
type History = { id: string; type: string; status: string; created_at: string };
type Response = { configured: boolean; preferences: Preferences; history: History[] };
const labels: Record<string,string> = {welcome:'Welcome',sign_in:'New sign-in',password_changed:'Password changed',support_received:'Support acknowledgment',workspace_saved:'Demo workspace saved',preview:'Requested preview'};
const statuses: Record<string,string> = {pending:'Queued',processing:'Sending',accepted:'Accepted by provider',failed:'Delivery attempt failed',expired:'Expired',skipped:'Skipped — opted out'};
export default function EmailNotifications() {
 const [data,setData] = useState<Response | null>(null), [prefs,setPrefs] = useState<Preferences | null>(null);
 const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
 const load = useCallback(async () => {
  try { const result = await api<Response>('notifications'); setData(result); setPrefs(result.preferences); setError(''); }
  catch(err) { setError(err instanceof Error ? err.message : 'Unable to load notifications.'); }
 }, []);
 useEffect(() => { void load(); },[load]);
 async function action(type: 'preferences' | 'preview') {
  if(busy) return; setBusy(true); setError(''); setNotice('');
  try {
   const result = await api<{status?: string}>('notifications','POST',{action:type,...(type==='preferences'?{preferences:prefs}:{})});
   await load(); setNotice(type==='preferences' ? 'Email preferences saved.' : result.status==='accepted' ? 'Preview accepted by the email provider. Inbox delivery is not yet confirmed.' : result.status==='failed' ? 'The provider did not accept this preview. Check your sender configuration.' : 'Preview queued. Check the delivery history for updates.');
  } catch(err) { setError(err instanceof Error ? err.message : 'Request failed.'); } finally { setBusy(false); }
 }
 return <section className="db-card db-span-4"><div className="db-card-head"><h2>Email notifications</h2><span className="db-tag info">{data ? data.configured ? 'Provider configured' : 'Setup required' : 'Account emails'}</span></div>
  <p className="db-small db-muted">Choose useful account updates. Welcome and password-change notices are transactional security messages, not marketing. Email preferences are separate from in-app reminders.</p>
  {data && !data.configured && <p className="db-small" style={{marginTop:12}}>Delivery is off until your administrator configures a verified sender and email provider. You can explore the templates below.</p>}
  {error && <p role="alert" className="db-alert">{error}</p>}{notice && <p role="status" className="db-alert ok">{notice}</p>}
  {prefs && <fieldset disabled={busy} style={{border:0,padding:0,margin:'18px 0'}}><legend className="db-small">Optional account emails</legend>{([
   ['sign_in','New sign-ins','A notice when your password is used to sign in. Off by default.'],
   ['support_received','Support acknowledgments','A receipt reference when you submit a support request.'],
   ['workspace_saved','Cloud demo saves','A confirmation after saving a simulation workspace. At most one per hour.'],
  ] as const).map(([key,title,description]) => <label className="db-setting" key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={prefs[key]} onChange={event=>setPrefs({...prefs,[key]:event.target.checked})} /></label>)}
   <button type="button" className="db-btn" disabled={busy} onClick={()=>void action('preferences')}>Save email preferences</button>
  </fieldset>}
  <div className="db-btn-row" style={{marginTop:18}}><a href="#emails" className="db-btn">Explore email studio ↗</a><button type="button" className="db-btn" disabled={busy || !data?.configured} onClick={()=>void action('preview')}>Email me a preview</button><button type="button" className="db-btn ghost" disabled={busy} onClick={()=>void load()}>Refresh email status</button></div>
  <p className="db-small db-muted" style={{marginTop:12}}>Previews go only to your account address, once per 15-minute window. Accepted means the provider accepted the email—not that it reached your inbox. No investment alerts, statements, or real transfer confirmations are sent.</p>
  {data && <details style={{marginTop:20}}><summary>Recent email activity</summary>{data.history.length ? <ul className="db-list">{data.history.map(item=><li key={item.id}><div><strong>{labels[item.type] || 'Account email'}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div><span className="db-small">{statuses[item.status] || item.status}</span></li>)}</ul> : <p className="db-small db-muted" style={{marginTop:12}}>No email activity yet.</p>}</details>}
 </section>;
}
