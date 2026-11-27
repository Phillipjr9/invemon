import { useEffect, useState } from 'react';
import { api, downloadJson } from '../services/api';

type Props<T> = { snapshot: T; onRestore: (snapshot: T) => void };
export default function WorkspaceSync<T>({ snapshot, onRestore }: Props<T>) {
 const [revision, setRevision] = useState<number | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
 useEffect(() => {
  let mounted = true;
  api<{workspace: {revision: number} | null}>('workspace').then(data => { if (mounted) { setRevision(data.workspace?.revision || 0); setMessage(data.workspace ? 'A cloud copy is available. Load it before editing on a new device.' : 'No cloud copy yet. Save this demo workspace to begin.'); } }).catch(err => { if (mounted) setMessage(err.message); });
  return () => { mounted = false; };
 }, []);
 async function save() {
  if (busy || revision === null) return; setBusy(true);
  try { const result = await api<{revision: number}>('workspace', 'PUT', { revision, snapshot }); setRevision(result.revision); setMessage('Demo workspace saved to your account.'); }
  catch (err) { setMessage(err instanceof Error ? err.message : 'Save failed.'); } finally { setBusy(false); }
 }
 async function load() {
  if (busy || !window.confirm('Replace this device’s demo workspace with the saved cloud copy? Export local data first to keep a backup.')) return;
  setBusy(true);
  try { const result = await api<{workspace: {revision: number; snapshot: T} | null}>('workspace'); if (!result.workspace) throw new Error('No cloud workspace saved yet.'); onRestore(result.workspace.snapshot); setRevision(result.workspace.revision); setMessage('Cloud demo workspace loaded.'); }
  catch (err) { setMessage(err instanceof Error ? err.message : 'Load failed.'); } finally { setBusy(false); }
 }
 return <section className="db-card db-span-4"><div className="db-card-head"><h2>Cloud demo workspace</h2></div>
  <p className="db-small db-muted">Explicit save/load prevents silently overwriting another device. This stores simulation data—not real financial balances. Market-directory favorites and appearance remain device-local.</p>
  <p role="status" className="db-small" style={{ marginTop: 12 }}>{message}</p>
  <div className="db-btn-row" style={{ marginTop: 16 }}><button type="button" className="db-btn" disabled={busy || revision === null} onClick={() => void save()}>Save demo to cloud</button><button type="button" className="db-btn" disabled={busy} onClick={() => void load()}>Load cloud demo</button><button type="button" className="db-btn" onClick={() => downloadJson('invemon-local-demo.json', snapshot)}>Export local demo</button></div>
 </section>;
}
