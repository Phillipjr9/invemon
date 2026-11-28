import './transaction-motion.css';
import {useCallback,useEffect,useState} from 'react';
import {api} from '../services/api';
import {formatLedgerUnits} from '../utils/ledger-display';
import type {HeaderNotice} from './DashboardChrome';
export type AccountEvent={id:string;created_at:string;kind:string;title:string;description:string;reference:string;destination:string;amounts:{asset:string;units:string;decimals:number}[];read:boolean};
type Page={entries:AccountEvent[];nextCursor:string|null;unreadCount?:string};
export function useAccountInbox(userId:string|undefined){
 const [entries,setEntries]=useState<AccountEvent[]>([]),[count,setCount]=useState(0),[error,setError]=useState('');
 const refresh=useCallback(async()=>{if(!userId)return;try{const r=await api<Page>('activity?view=inbox');setEntries(r.entries);setCount(Number(r.unreadCount||'0'));setError('');}catch{setError('Notifications unavailable.');}},[userId]);
 useEffect(()=>{setEntries([]);setCount(0);setError('');void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);return()=>clearInterval(timer);},[refresh]);
 const mark=async(id?:string)=>{try{await api('activity','POST',id?{action:'read',id}:{action:'read-all'});await refresh();return true;}catch{setError('Unable to save notification read state. Please retry.');return false;}};
 const notices:HeaderNotice[]=entries.map(e=>({id:e.id,icon:e.kind==='accounting'?'list':'wallet',level:'info',title:e.title,body:e.description,section:'activity',action:'View activity'}));
 return {notices,readIds:entries.filter(e=>e.read).map(e=>e.id),count,error,refresh,mark};
}
export default function AccountActivity({hidden}:{hidden:boolean}){
 const [entries,setEntries]=useState<AccountEvent[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(before:string|null=null)=>{setBusy(true);setError('');try{const r=await api<Page>(`activity${before?'?before='+encodeURIComponent(before):''}`);setEntries(old=>before?[...old,...r.entries.filter(e=>!old.some(o=>o.id===e.id))]:r.entries);setNext(r.nextCursor);}catch(e){setError(e instanceof Error?e.message:'Unable to load activity.');}finally{setBusy(false);}},[]);
 useEffect(()=>{void load();},[load]);
 return <section className="db-card ledger-records transaction-flow" aria-label="Unified account timeline"><div className="db-card-head"><h2>Account timeline</h2><button className="db-btn" disabled={busy} onClick={()=>void load()}>Refresh timeline</button></div><p>Requests and review decisions are separate from posted accounting changes. Approval is not payment. Amounts on withdrawal requests are reserved, not debited.</p>{error&&<p role="alert">{error} Previously loaded records may be out of date.</p>}{busy&&<p className="flow-pending" role="status">Loading timeline…</p>}{!busy&&!error&&!entries.length&&<p>No account events recorded yet.</p>}<ol className="ledger-activity-list">{entries.map(e=><li key={e.id}><div className="ledger-entry-heading"><strong>{e.title}</strong><time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time></div><p>{e.description}</p><ul>{e.amounts.map(a=><li key={a.asset}><span>{a.asset}</span><strong>{hidden?'••••••':formatLedgerUnits(a.units,a.decimals)}</strong></li>)}</ul><small>Reference {e.reference}</small>{e.destination==='withdrawals'&&<p><a href="#withdrawals">View withdrawal history</a></p>}</li>)}</ol>{next&&<button className="db-btn" disabled={busy} onClick={()=>void load(next)}>Load older events</button>}</section>;
}
