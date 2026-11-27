import {useCallback,useEffect,useState} from 'react';
import {api} from '../services/api';
import {Wordmark} from './HomePage';
import type {InvestmentAccount} from '../components/Dialogs';
import './funding-page.css';
type Payment={id:string;environment:string;amount_usd:string;status:string;created_at:string};
type Funding={environment:string;liveEnabled:boolean;configured:boolean;requests:Payment[]};
const statusLabel=(value:string)=>({creating:'Request started',waiting:'Checkout created · not paid',needs_review:'Requires reconciliation',failed:'Request failed',expired:'Expired'}[value]||'Awaiting review');
export default function FundingPage({account,onBack,onLogin}:{account:InvestmentAccount|null;onBack:()=>void;onLogin:()=>void}){
 const [data,setData]=useState<Funding|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{setError('');setBusy(true);try{setData(await api<Funding>('funding'));}catch(e){setError(e instanceof Error?e.message:'Unable to load payment history.');}finally{setBusy(false);}},[]);
 useEffect(()=>{if(account?.serverUserId)void load();},[account?.serverUserId,load]);
 return <main className="funding-page"><header><Wordmark/><button className="db-btn" onClick={onBack}>Back to dashboard</button></header>
 <section className="funding-intro"><span className="funding-eyebrow">ACCOUNT FUNDING</span><h1>A clear record.<br/>Before money moves.</h1><p>Manage deposit requests separately from your investment workspace. A checkout, screenshot or return-page visit is not proof of funds received.</p></section>
 <div className="funding-warning" role="note"><strong>Real deposits are not open.</strong><p>Settlement verification and account-ledger controls are not complete. Do not send crypto or bank transfers. No spendable or withdrawable balance is created here.</p></div>
 {!account?.serverUserId?<section className="funding-card"><h2>Sign in to view your funding requests</h2><p>Payment records belong to your server account, not this browser’s demo portfolio.</p><button className="db-btn" onClick={onLogin}>Sign in</button></section>:<>
 {error&&<p role="alert" className="db-alert">{error}</p>}
 <div className="funding-grid"><section className="funding-card"><span className="funding-eyebrow">DEPOSIT METHODS</span><h2>Crypto &amp; bank transfers</h2><p>Live crypto deposits and bank instructions are unavailable until reconciliation and funding controls are approved.</p><button className="db-btn" disabled>Live deposits unavailable</button><p className="funding-caption">Never transfer to a unverified address or an account supplied outside the approved deposit flow.</p></section>
 <section className="funding-card"><span className="funding-eyebrow">SERVER-RECORDED REQUESTS</span><div className="funding-row"><h2>Payment history</h2><button className="db-btn" disabled={busy} onClick={()=>void load()}>Refresh history</button></div>
 {!data?<p role="status">{busy?'Loading your records…':'Records unavailable. Retry using Refresh history.'}</p>:!data.requests.length?<p>No production funding requests recorded. No balance is inferred from browser storage.</p>:<ul className="funding-history">{data.requests.filter(item=>item.environment==='production').map(item=><li key={item.id}><div><strong>${item.amount_usd} USD</strong><span>{statusLabel(item.status)}</span></div><small>Production · {new Date(item.created_at).toLocaleString()}<br/>Reference: {item.id}</small></li>)}</ul>}</section></div>

 </>}
 <footer>Invemon · Funding requests are not investment statements, proof of custody or completed trades.</footer></main>;
}
