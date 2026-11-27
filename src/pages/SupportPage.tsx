import { useEffect, useState, type FormEvent } from 'react';
import { api, accountAction } from '../services/api';
import { Wordmark } from './HomePage';
import './support.css';

type Ticket = { id: string; subject: string; message?: string; status: string; revision: number; created_at: string; updated_at: string; customer_email?: string };
type Message = { id: string; actor_role: string; visibility: string; message: string; created_at: string };
const statuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
const date = (value: string) => new Date(value).toLocaleString();
const statusLabel = (value: string) => value.replace(/_/g, ' ');

export default function SupportPage({ signedIn, onBack, onLogin }: { signedIn: boolean; onBack: () => void; onLogin: () => void }) {
 const [staff, setStaff] = useState(false), [tickets, setTickets] = useState<Ticket[]>([]), [selected, setSelected] = useState('');
 const [ticket, setTicket] = useState<Ticket | null>(null), [messages, setMessages] = useState<Message[]>([]);
 const [reload, setReload] = useState(0), [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 const [draft, setDraft] = useState(''), [visibility, setVisibility] = useState('public'), [password, setPassword] = useState(''), [nextStatus, setNextStatus] = useState('open');
 useEffect(() => {
  if (!signedIn) return;
  let active = true; setLoading(true);
  api<{ staff: boolean; tickets: Ticket[] }>('support').then(result => { if (active) { setStaff(result.staff); setTickets(result.tickets); } })
   .catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [signedIn, reload]);
 useEffect(() => {
  setTicket(null); setMessages([]); setDraft(''); setPassword(''); setVisibility('public');
  if (!selected || !signedIn) return;
  let active = true; setDetailLoading(true);
  api<{ staff: boolean; ticket: Ticket; messages: Message[] }>(`support?id=${encodeURIComponent(selected)}`).then(result => {
   if (active) { setStaff(result.staff); setTicket(result.ticket); setMessages(result.messages); setNextStatus(result.ticket.status); }
  }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setDetailLoading(false); });
  return () => { active = false; };
 }, [selected, signedIn, reload]);
 async function create(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
  setBusy(true); setError(''); setNotice('');
  try { const result = await accountAction('support', data); form.reset(); setSelected(result.id || ''); setReload(v => v + 1); setNotice('Your request was saved. Replies appear here; email delivery is not guaranteed.'); }
  catch (err) { setError(err instanceof Error ? err.message : 'Unable to send request.'); }
  finally { setBusy(false); }
 }
 async function update(action: 'reply' | 'status', event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (!ticket || busy || detailLoading) return;
  setBusy(true); setError(''); setNotice('');
  try {
   await api('support', 'POST', { action, id: ticket.id, revision: ticket.revision, message: draft, visibility, status: nextStatus, ...(staff ? { currentPassword: password } : {}) });
   setDraft(''); setPassword(''); setReload(v => v + 1); setNotice(action === 'reply' ? 'Message saved.' : 'Request status updated.');
  } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update request.'); }
  finally { setBusy(false); }
 }
 return <main className="support-page"><header className="support-header"><Wordmark /><button className="db-btn" onClick={onBack}>Back to workspace</button></header>
  <div className="support-intro"><span className="support-eyebrow">A LITTLE GUIDANCE, WHEN YOU NEED IT</span><h1>{staff ? 'Support desk.' : 'Let’s work through it.'}</h1><p>{staff ? 'Restricted staff workspace. Access and updates are authorized on the server.' : 'A place for questions about your Invemon account and simulated workspace.'}</p><p>Never send passwords, identity documents, card numbers, wallet keys, or seed phrases. Not an emergency channel or investment advice.</p></div>
  {!signedIn ? <section className="support-panel"><h2>Sign in to contact support</h2><p>Your requests and replies are private to your account and authorized support staff.</p><button className="db-btn" onClick={onLogin}>Sign in</button></section> : <>
   {error && <p className="support-error" role="alert">{error} <button className="db-btn" disabled={busy} onClick={() => { setError(''); setReload(v => v + 1); }}>Reload requests</button></p>}
   {notice && <p className="support-notice" role="status">{notice}</p>}
   <div className="support-layout"><aside className="support-panel"><div className="support-panel-heading"><h2>{staff ? 'Recent requests' : 'Your requests'}</h2><button className="db-btn" disabled={busy || loading} onClick={() => setReload(v => v + 1)}>Refresh</button></div>
    {loading && <p role="status">Loading requests…</p>}
    {!loading && !tickets.length && <p>No requests yet. Send your first question below.</p>}
    <ul className="support-ticket-list">{tickets.map(item => <li key={item.id}><button disabled={busy} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setError(''); setNotice(''); }}><strong>{item.subject}</strong><span>{statusLabel(item.status)}</span>{item.customer_email && <small>{item.customer_email}</small>}<small>{date(item.updated_at)}</small></button></li>)}</ul>
    <p className="support-fine">Showing up to 50 most recently updated requests.</p>
    {!staff && <details className="support-new"><summary>Send a new request</summary><form onSubmit={create} className="support-form"><label>Subject<input name="subject" minLength={3} maxLength={120} required /></label><label>How can we help?<textarea name="message" minLength={10} maxLength={4000} required rows={5} /></label><button className="db-btn" disabled={busy} type="submit">Send request</button></form></details>}
   </aside><section className="support-panel support-thread" aria-label="Support conversation">
    {detailLoading ? <p role="status">Loading conversation…</p> : !ticket ? <div className="support-empty"><h2>A clearer path forward.</h2><p>Select a request to read replies{staff ? ' and manage its status.' : ', or send a new question.'}</p></div> : <>
     <div className="support-panel-heading"><h2>{ticket.subject}</h2><span className="support-status">{statusLabel(ticket.status)}</span></div>
     <p className="support-fine">Request {ticket.id} · {date(ticket.created_at)}</p><article className="support-message"><span>Original request</span><p>{ticket.message}</p></article>
     <ol className="support-messages">{messages.map(message => <li key={message.id}><article className={`support-message ${message.visibility === 'internal' ? 'is-internal' : ''}`}><span>{message.actor_role === 'staff' ? 'Support team' : 'Customer'}{message.visibility === 'internal' ? ' · INTERNAL NOTE' : ''}</span><p>{message.message}</p><small>{date(message.created_at)}</small></article></li>)}</ol>
     <p className="support-fine">Original request plus up to 100 recent messages. Replies are stored here, not automatically emailed.</p>
     <form className="support-form" onSubmit={event => void update('reply', event)}><label>{staff && visibility === 'internal' ? 'Internal note' : 'Reply'}<textarea aria-label={staff && visibility === 'internal' ? 'Internal note' : 'Reply'} required maxLength={4000} rows={4} value={draft} onChange={event => setDraft(event.target.value)} /></label>
      {staff && <><label>Visibility<select aria-label="Visibility" value={visibility} onChange={event => setVisibility(event.target.value)}><option value="public">Customer-visible reply</option><option value="internal">Staff-only internal note</option></select></label><label>Confirm staff password<input type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label></>}
      <button className="db-btn" disabled={busy || detailLoading} type="submit">{visibility === 'internal' ? 'Save internal note' : 'Send reply'}</button>
     </form>
     {staff && <form className="support-form support-status-form" onSubmit={event => void update('status', event)}><label>Request status<select aria-label="Request status" value={nextStatus} onChange={event => setNextStatus(event.target.value)}>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><p className="support-fine">Enter your staff password above to confirm a status change.</p><button className="db-btn" disabled={busy || !password || detailLoading} type="submit">Update status</button></form>}
    </>}
   </section></div>
  </>}
 </main>;
}
