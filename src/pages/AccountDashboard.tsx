import {useEffect,useState} from 'react';
import {api} from '../services/api';
import AssetDirectory from '../components/AssetDirectory';
import CryptoMarket, {type CryptoView} from '../components/CryptoMarket';
import type {InvestmentAccount} from '../components/Dialogs';
import LedgerActivity,{LedgerBalances} from '../components/LedgerRecords';
import ServerAccountTools from '../components/ServerAccountTools';
import Icon from '../components/Icon';
import {DashboardHeader,CommandPalette,type DashboardSection} from '../components/DashboardChrome';
import {Wordmark} from './HomePage';
import './funding-page.css';
import './dashboard.css';
import './dashboard-editorial.css';
import './account-dashboard.css';

const sections:{id:DashboardSection;label:string;icon:string}[]=[
 {id:'overview',label:'Overview',icon:'grid'},{id:'portfolio',label:'Portfolio',icon:'layers'},
 {id:'markets',label:'Markets',icon:'trend'},{id:'crypto',label:'Crypto',icon:'coins'},
 {id:'yield',label:'Yield & Income',icon:'percent'},{id:'autoinvest',label:'Auto-invest',icon:'repeat'},
 {id:'goals',label:'Goals',icon:'target'},{id:'activity',label:'Activity',icon:'list'},
 {id:'insights',label:'Insights',icon:'bulb'},{id:'settings',label:'Settings',icon:'settings'},
];
const emptyCopy:Partial<Record<DashboardSection,[string,string]>>={
 portfolio:['No recorded holdings','Your investment positions will appear here when available.'],
 markets:['Market data is not connected','Quotes will appear once a market-data service is connected.'],
 crypto:['Digital assets','Crypto quotes and account positions are not available yet.'],
 yield:['Your income, in view','Recorded dividends and interest will appear here.'],
 autoinvest:['Build a lasting habit','Recurring investments are not available yet.'],
 goals:['Make room for what matters','Goal planning is not available yet.'],
 activity:['No investment activity to show','Your completed transactions will appear here.'],
 insights:['The bigger picture','Portfolio insights will appear when account records are available.'],
};
export default function AccountDashboard({account,onAccount,onBack,onLogin,onSignOut}:{account:InvestmentAccount|null;onAccount:(value:InvestmentAccount|null)=>void;onBack:()=>void;onLogin:()=>void;onSignOut:()=>void}){
 const [section,setSection]=useState<DashboardSection>(()=>{const value=new URLSearchParams(window.location.hash.split('?')[1]||'').get('section');return sections.find(s=>s.id===value)?.id||'overview';});
 const [hidden,setHidden]=useState(false),[command,setCommand]=useState(false),[more,setMore]=useState(false);
 const [chart,setChart]=useState('Performance'),[range,setRange]=useState('1M');
 const [settingsDirty,setSettingsDirty]=useState(false);
 const mayLeave=()=>section!=='settings'||!settingsDirty||window.confirm('Discard your unsaved settings changes?');
 const deposit=()=>{if(mayLeave())window.location.hash='funding';};
 const title=sections.find(s=>s.id===section)?.label||'Overview';
 const navigate=(next:DashboardSection)=>{if(next===section||mayLeave()){setSection(next);setMore(false);const hash=next==='overview'?'#dashboard':`#dashboard?section=${next}`;if(window.location.hash!==hash)window.location.hash=hash;window.scrollTo({top:0,behavior:'instant'});}};
 useEffect(()=>{const sync=()=>{if(window.location.hash.split('?')[0]!=='#dashboard')return;const value=new URLSearchParams(window.location.hash.split('?')[1]||'').get('section');const next=sections.find(s=>s.id===value)?.id||'overview';if(next!==section){if(mayLeave()){setSection(next);setMore(false);}else window.history.replaceState(null,'',`#dashboard?section=${section}`);}};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[section,settingsDirty]);
 const [balanceRevision,setBalanceRevision]=useState(0);
 const [balances,setBalances]=useState<{asset:string;units:string;decimals:number}[]|null>(null),[balanceError,setBalanceError]=useState(false);
 useEffect(()=>{try{setHidden(localStorage.getItem(`invemon-hide-balances:${account?.serverUserId}`)==='true');}catch{setHidden(false);}},[account?.serverUserId]);
 const setBalancePrivacy=(value:boolean)=>{setHidden(value);try{localStorage.setItem(`invemon-hide-balances:${account?.serverUserId}`,String(value));}catch{/* Optional display preference, never financial state. */}};
 const [cryptoView,setCryptoView]=useState<CryptoView>('all'),[favorites,setFavorites]=useState<string[]>([]);
 useEffect(()=>{let active=true;setBalances(null);setBalanceError(false);if(account?.serverUserId)void api<{balances:{asset:string;units:string;decimals:number}[]}>('balances').then(r=>{if(active)setBalances(r.balances);}).catch(()=>{if(active)setBalanceError(true);});return()=>{active=false;};},[account?.serverUserId,balanceRevision]);
 useEffect(()=>{try{const value:unknown=JSON.parse(localStorage.getItem(`invemon-crypto-favorites:${account?.serverUserId}`)||'[]');setFavorites(Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[]);}catch{setFavorites([]);}},[account?.serverUserId]);
 const toggleFavorite=(id:string)=>setFavorites(previous=>{const next=previous.includes(id)?previous.filter(v=>v!==id):[...previous,id];try{localStorage.setItem(`invemon-crypto-favorites:${account?.serverUserId}`,JSON.stringify(next));}catch{/* Optional watchlist storage only. */}return next;});
 const usd=balances?.filter(b=>b.asset==='USD:BANK'&&b.decimals===2).reduce((sum,b)=>sum+BigInt(b.units),0n);
 const dollars=(value:bigint)=>{const n=value<0n?-value:value;return `${value<0n?'-':''}$${(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(n%100n).toString().padStart(2,'0')}`;};
 const cash=hidden?'••••••':usd===undefined?'—':dollars(usd);
 const valued=balances!==null&&balances.every(b=>BigInt(b.units)===0n||b.asset==='USD:BANK'&&b.decimals===2);
 const metric=hidden?'••••••':valued&&usd!==undefined?dollars(usd):'—';
 const empty=(heading:string,copy:string)=><div className="account-empty"><Icon name="layers" size={26}/><h2>{heading}</h2><p>{copy}</p></div>;
 if(!account)return <main className="funding-page"><button className="account-brand" onClick={onBack}><Wordmark/></button><section className="funding-intro"><h1>Your next chapter.</h1><p>Sign in to your Invemon account.</p><button className="db-btn" onClick={onLogin}>Sign in</button></section></main>;
 return <div className="db-page-wrap db-editorial account-dashboard">
 <DashboardHeader account={account} section={section} hideBalances={hidden} unreadCount={0} notifications={[]} readNotificationIds={[]}
 onNavigate={navigate} onBackToWebsite={onBack} onOpenDeposit={deposit} onOpenTrade={()=>navigate('portfolio')} onTogglePrivacy={()=>setBalancePrivacy(!hidden)}
 onOpenCommand={()=>setCommand(true)} onSelectNotification={()=>{}} onMarkAllRead={()=>{}} onOpenSupport={()=>{window.location.hash='support';}} onOpenProfile={()=>navigate('settings')} onSignOut={onSignOut}/>
 <div className="db-shell"><aside className="db-side" aria-label="Dashboard workspace navigation">
 <div className="db-side-heading">YOUR WORKSPACE</div><div className="db-side-account"><span>Personal investing</span><small>Your account</small></div>
 {sections.map((s,i)=><button key={s.id} className={`db-navbtn ${section===s.id?'active':''} ${i>3?'db-navbtn-secondary':''}`} aria-label={s.label} aria-current={section===s.id?'page':undefined} onClick={()=>navigate(s.id)}><Icon name={s.icon} size={18}/><span>{s.label}</span></button>)}
 <button className={`db-navbtn db-mobile-more ${more?'active':''}`} aria-label="More dashboard sections" aria-expanded={more} onClick={()=>setMore(v=>!v)}><Icon name="menu" size={18}/><span>More</span></button>
 {more&&<div className="db-more-panel" role="group" aria-label="More dashboard sections">{sections.slice(4).map(s=><button key={s.id} onClick={()=>navigate(s.id)}>{s.label}</button>)}</div>}
 <div className="db-side-yield-card"><Icon name="sprout" size={24}/><span>The longer view.</span><strong>Little by little.<br/>Over time.</strong><small>A plan for what matters to you.</small><button onClick={()=>navigate('goals')}>Explore your goals <Icon name="arrow" size={14}/></button></div>
 </aside><main className="db-main"><div className="db-subbar"><div><span className="db-subbar-crumb">YOUR WORLD. IN PERSPECTIVE. / {title.toUpperCase()}</span><h1>{section==='overview'?<>A little more perspective, <em>{account.name.split(' ')[0]}.</em></>:title}</h1><p className="db-subbar-description">Your investments, your progress, and what comes next.</p></div><div className="db-subbar-actions"><button className="db-btn ghost" onClick={()=>setCommand(true)}><Icon name="search" size={15}/> Quick Jump</button><a className="db-btn lime" href="#funding" onClick={event=>{if(!mayLeave())event.preventDefault();}}><Icon name="plus" size={15}/> Deposit</a></div></div>
 <div className="db-content"><div className="account-availability"><span><i/> Deposits and trading are not available yet.</span><a href="#funding" onClick={event=>{if(!mayLeave())event.preventDefault();}}>View availability <Icon name="arrow" size={14}/></a></div>
 {section==='portfolio'?<LedgerBalances balances={balances} hidden={hidden} error={balanceError} onRetry={()=>setBalanceRevision(v=>v+1)}/>:section==='activity'?<LedgerActivity hidden={hidden}/>:section==='markets'?<AssetDirectory/>:section==='crypto'?<CryptoMarket favorites={favorites} onToggleFavorite={toggleFavorite} view={cryptoView} onViewChange={setCryptoView}/>:section==='settings'?<div className="account-settings"><ServerAccountTools account={account} onAccount={onAccount} onSignedOut={onBack} onDirtyChange={setSettingsDirty} hideBalances={hidden} onHideBalancesChange={setBalancePrivacy}/></div>:section==='overview'?<>
 <section className="db-overview-stage" aria-label="Portfolio summary"><section className="db-card db-portfolio-chart" aria-label="Portfolio analytics"><div className="db-portfolio-heading"><span><i/> YOUR PORTFOLIO</span><span>ACCOUNT OVERVIEW</span></div><div className="db-portfolio-balance"><span>Total portfolio value</span><strong>{metric}</strong><div className="db-muted">{balanceError?'Balance unavailable. Please reload to retry.':balances===null?'Loading your balance…':valued?'Recorded account value':'Some assets require market valuation'}</div>{balanceError&&<button className="db-btn" onClick={()=>setBalanceRevision(v=>v+1)}>Retry balance</button>}</div>
 <div className="db-card-head"><div className="db-seg" role="tablist" aria-label="Analytics mode">{['Performance','Contributions vs Growth','Passive Income'].map(t=><button role="tab" aria-selected={chart===t} className={chart===t?'selected':''} key={t} onClick={()=>setChart(t)}>{t}</button>)}</div><div className="db-seg" role="group" aria-label="Chart period">{['1D','1W','1M','1Y','ALL'].map(r=><button key={r} className={range===r?'selected':''} aria-pressed={range===r} onClick={()=>setRange(r)}>{r}</button>)}</div></div>
 <div className="account-chart-empty" role="tabpanel" aria-label={`${chart}, ${range}`}>{empty(chart==='Performance'?'Your progress starts here':chart==='Passive Income'?'No income recorded':'No contributions recorded','Your '+(chart==='Performance'?'portfolio performance':chart==='Passive Income'?'income history':'contribution history')+' will appear when records are available.')}</div></section>
 <div className="db-cash-stack"><section className="db-cash-card" aria-label="Available cash"><div className="db-cash-card-top"><span>YOUR CASH ACCOUNT</span><Icon name="wallet" size={23}/></div><div className="db-cash-card-balance"><span>Recorded cash balance</span><strong>{cash}</strong><small>{balanceError?'Balance unavailable':balances===null?'Loading balance…':'USD · Ledger balance'}</small></div><div className="db-cash-card-bottom"><span>A little today. More possibility tomorrow.</span><Icon name="sprout" size={26}/></div></section>
 <section className="db-card db-editorial-quick" aria-label="Quick actions"><div className="db-card-head"><h2>Move with intention.</h2><Icon name="external" size={15}/></div><div className="db-quick"><button onClick={deposit}><span className="db-quick-icon"><Icon name="plus" size={19}/></span>Add money</button>{[['Withdraw','arrow'],['Invest','trend'],['Swap','repeat'],['Sell','chart']].map(([label,icon])=><button key={label} disabled title={`${label} is not available yet`}><span className="db-quick-icon"><Icon name={icon} size={19}/></span>{label}</button>)}</div><button className="db-recurring-link" onClick={()=>navigate('autoinvest')}><span><Icon name="repeat" size={17}/><span>Small steps. Lasting habits.<small>Explore recurring investments</small></span></span><Icon name="arrow" size={16}/></button></section></div></section>
 <div className="db-grid"><div className="db-overview-section-title db-span-4"><div><span>THE BIGGER PICTURE</span><h2>Built around <em>your ambitions.</em></h2></div><button className="db-btn ghost" onClick={()=>navigate('insights')}>Portfolio insights <Icon name="arrow" size={15}/></button></div>
 {['Monthly auto-invest','Annual passive income','Goals on track','Allocation health'].map(label=><section className="db-card db-summary-kpi" key={label}><div className="db-kpi"><span>{label}</span><strong>{hidden?'••••••':'—'}</strong><small>Not available yet</small></div></section>)}
 <section className="db-card db-span-2"><div className="db-card-head"><h2>Asset allocation</h2></div>{empty('Room to grow','Your allocation will appear with your recorded positions.')}</section>
 <section className="db-card db-span-2"><div className="db-card-head"><h2>Top holdings</h2><button className="db-btn ghost" onClick={()=>navigate('portfolio')}>Full portfolio</button></div>{empty('No recorded holdings','Your investment positions will appear here.')}</section>
 <LedgerActivity hidden={hidden} compact/></div>
 </>:<section className="db-card">{empty(...(emptyCopy[section]||['Your account','Account records will appear here.']))}</section>}
 </div></main></div><footer className="db-editorial-footer account-full-footer" aria-label="Invemon platform footer"><div className="db-editorial-footer-top"><button className="account-brand" onClick={onBack} aria-label="Invemon home"><Wordmark/></button><span>Invest with perspective.</span><button onClick={()=>navigate('settings')}>Account settings</button><a href="#funding" onClick={event=>{if(!mayLeave())event.preventDefault();}}>Deposits &amp; payment history</a><a href="#support">Need a hand? <Icon name="arrow" size={16}/></a></div><div className="account-footer-links"><div><strong>Your account</strong><button onClick={()=>navigate('portfolio')}>Portfolio</button><button onClick={()=>navigate('activity')}>Activity</button><button onClick={()=>navigate('settings')}>Profile &amp; security</button></div><div><strong>Explore</strong><button onClick={()=>navigate('markets')}>Stocks &amp; funds</button><button onClick={()=>navigate('crypto')}>Crypto assets</button><button onClick={()=>navigate('insights')}>Insights</button></div><div><strong>Here to help</strong><a href="#support">Contact support</a><button onClick={onBack}>Visit our website</button><button onClick={onSignOut}>Sign out</button></div></div><p>Investing involves risk, including loss of principal. Market data is not a guarantee of execution or future returns. Asset listings are separate from your holdings. Deposits and trading remain unavailable until the required services are enabled.</p><div className="db-editorial-footer-bottom"><span>© {new Date().getFullYear()} Invemon. A longer-term perspective.</span><button onClick={onBack}>Back to website <Icon name="arrow" size={16}/></button></div></footer>
 <CommandPalette open={command} onClose={()=>setCommand(false)} items={sections.map(s=>({id:s.id,group:'Sections' as const,title:s.label,subtitle:'Go to '+s.label,icon:s.icon,onSelect:()=>{navigate(s.id);setCommand(false);}}))}/>
 </div>;
}
