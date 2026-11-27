import {useState} from 'react';
import type {InvestmentAccount} from '../components/Dialogs';
import ServerAccountTools from '../components/ServerAccountTools';
import EmailNotifications from '../components/EmailNotifications';
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
 const [section,setSection]=useState<DashboardSection>('overview');
 const [hidden,setHidden]=useState(false),[command,setCommand]=useState(false),[more,setMore]=useState(false);
 const [chart,setChart]=useState('Performance'),[range,setRange]=useState('1M');
 const deposit=()=>{window.location.hash='funding';};
 const title=sections.find(s=>s.id===section)?.label||'Overview';
 const navigate=(next:DashboardSection)=>{setSection(next);setMore(false);};
 const metric=hidden?'••••••':'—';
 const empty=(heading:string,copy:string)=><div className="account-empty"><Icon name="layers" size={26}/><h2>{heading}</h2><p>{copy}</p></div>;
 if(!account)return <main className="funding-page"><button className="account-brand" onClick={onBack}><Wordmark/></button><section className="funding-intro"><h1>Your next chapter.</h1><p>Sign in to your Invemon account.</p><button className="db-btn" onClick={onLogin}>Sign in</button></section></main>;
 return <div className="db-page-wrap db-editorial account-dashboard">
 <DashboardHeader account={account} section={section} hideBalances={hidden} unreadCount={0} notifications={[]} readNotificationIds={[]}
 onNavigate={navigate} onBackToWebsite={onBack} onOpenDeposit={deposit} onOpenTrade={()=>navigate('portfolio')} onTogglePrivacy={()=>setHidden(v=>!v)}
 onOpenCommand={()=>setCommand(true)} onSelectNotification={()=>{}} onMarkAllRead={()=>{}} onOpenSupport={()=>{window.location.hash='support';}} onOpenProfile={()=>navigate('settings')} onSignOut={onSignOut}/>
 <div className="db-shell"><aside className="db-side" aria-label="Dashboard workspace navigation">
 <div className="db-side-heading">YOUR WORKSPACE</div><div className="db-side-account"><span>Personal investing</span><small>Your account</small></div>
 {sections.map((s,i)=><button key={s.id} className={`db-navbtn ${section===s.id?'active':''} ${i>3?'db-navbtn-secondary':''}`} aria-label={s.label} aria-current={section===s.id?'page':undefined} onClick={()=>navigate(s.id)}><Icon name={s.icon} size={18}/><span>{s.label}</span></button>)}
 <button className={`db-navbtn db-mobile-more ${more?'active':''}`} aria-label="More dashboard sections" aria-expanded={more} onClick={()=>setMore(v=>!v)}><Icon name="menu" size={18}/><span>More</span></button>
 {more&&<div className="db-more-panel" role="group" aria-label="More dashboard sections">{sections.slice(4).map(s=><button key={s.id} onClick={()=>navigate(s.id)}>{s.label}</button>)}</div>}
 <div className="db-side-yield-card"><Icon name="sprout" size={24}/><span>The longer view.</span><strong>Little by little.<br/>Over time.</strong><small>A plan for what matters to you.</small><button onClick={()=>navigate('goals')}>Explore your goals <Icon name="arrow" size={14}/></button></div>
 </aside><main className="db-main"><div className="db-subbar"><div><span className="db-subbar-crumb">YOUR WORLD. IN PERSPECTIVE. / {title.toUpperCase()}</span><h1>{section==='overview'?<>A little more perspective, <em>{account.name.split(' ')[0]}.</em></>:title}</h1><p className="db-subbar-description">Your investments, your progress, and what comes next.</p></div><div className="db-subbar-actions"><button className="db-btn ghost" onClick={()=>setCommand(true)}><Icon name="search" size={15}/> Quick Jump</button><a className="db-btn lime" href="#funding"><Icon name="plus" size={15}/> Deposit</a></div></div>
 <div className="db-content"><div className="account-availability"><span><i/> Deposits and trading are not available yet.</span><a href="#funding">View availability <Icon name="arrow" size={14}/></a></div>
 {section==='settings'?<div className="account-settings"><ServerAccountTools account={account} onAccount={onAccount} onSignedOut={onBack}/><EmailNotifications/></div>:section==='overview'?<>
 <section className="db-overview-stage" aria-label="Portfolio summary"><section className="db-card db-portfolio-chart" aria-label="Portfolio analytics"><div className="db-portfolio-heading"><span><i/> YOUR PORTFOLIO</span><span>ACCOUNT OVERVIEW</span></div><div className="db-portfolio-balance"><span>Total portfolio value</span><strong>{metric}</strong><div className="db-muted">No recorded portfolio value</div></div>
 <div className="db-card-head"><div className="db-seg" role="tablist" aria-label="Analytics mode">{['Performance','Contributions vs Growth','Passive Income'].map(t=><button role="tab" aria-selected={chart===t} className={chart===t?'selected':''} key={t} onClick={()=>setChart(t)}>{t}</button>)}</div><div className="db-seg" role="group" aria-label="Chart period">{['1D','1W','1M','1Y','ALL'].map(r=><button key={r} className={range===r?'selected':''} aria-pressed={range===r} onClick={()=>setRange(r)}>{r}</button>)}</div></div>
 <div className="account-chart-empty" role="tabpanel" aria-label={`${chart}, ${range}`}>{empty(chart==='Performance'?'Your progress starts here':chart==='Passive Income'?'No income recorded':'No contributions recorded','Your '+(chart==='Performance'?'portfolio performance':chart==='Passive Income'?'income history':'contribution history')+' will appear when records are available.')}</div></section>
 <div className="db-cash-stack"><section className="db-cash-card" aria-label="Available cash"><div className="db-cash-card-top"><span>YOUR CASH ACCOUNT</span><Icon name="wallet" size={23}/></div><div className="db-cash-card-balance"><span>Available to invest</span><strong>{metric}</strong><small>Balance not available</small></div><div className="db-cash-card-bottom"><span>A little today. More possibility tomorrow.</span><Icon name="sprout" size={26}/></div></section>
 <section className="db-card db-editorial-quick" aria-label="Quick actions"><div className="db-card-head"><h2>Move with intention.</h2><Icon name="external" size={15}/></div><div className="db-quick"><button onClick={deposit}><span className="db-quick-icon"><Icon name="plus" size={19}/></span>Add money</button>{[['Withdraw','arrow'],['Invest','trend'],['Swap','repeat'],['Sell','chart']].map(([label,icon])=><button key={label} disabled title={`${label} is not available yet`}><span className="db-quick-icon"><Icon name={icon} size={19}/></span>{label}</button>)}</div><button className="db-recurring-link" onClick={()=>navigate('autoinvest')}><span><Icon name="repeat" size={17}/><span>Small steps. Lasting habits.<small>Explore recurring investments</small></span></span><Icon name="arrow" size={16}/></button></section></div></section>
 <div className="db-grid"><div className="db-overview-section-title db-span-4"><div><span>THE BIGGER PICTURE</span><h2>Built around <em>your ambitions.</em></h2></div><button className="db-btn ghost" onClick={()=>navigate('insights')}>Portfolio insights <Icon name="arrow" size={15}/></button></div>
 {['Monthly auto-invest','Annual passive income','Goals on track','Allocation health'].map(label=><section className="db-card db-summary-kpi" key={label}><div className="db-kpi"><span>{label}</span><strong>{metric}</strong><small>Not available yet</small></div></section>)}
 <section className="db-card db-span-2"><div className="db-card-head"><h2>Asset allocation</h2></div>{empty('Room to grow','Your allocation will appear with your recorded positions.')}</section>
 <section className="db-card db-span-2"><div className="db-card-head"><h2>Top holdings</h2><button className="db-btn ghost" onClick={()=>navigate('portfolio')}>Full portfolio</button></div>{empty('No recorded holdings','Your investment positions will appear here.')}</section>
 <section className="db-card db-span-4"><div className="db-card-head"><h2>Recent activity</h2><button className="db-btn ghost" onClick={()=>navigate('activity')}>View all</button></div>{empty('No investment activity to show','Your completed transactions will appear here.')}</section></div>
 </>:<section className="db-card">{empty(...(emptyCopy[section]||['Your account','Account records will appear here.']))}</section>}
 </div></main></div><footer className="account-dashboard-footer"><button className="account-brand" onClick={onBack}><Wordmark/></button><span>Invest with a longer view.</span><a href="#support">Support</a><button className="db-btn ghost" onClick={onSignOut}>Sign out</button></footer>
 <CommandPalette open={command} onClose={()=>setCommand(false)} items={sections.map(s=>({id:s.id,group:'Sections' as const,title:s.label,subtitle:'Go to '+s.label,icon:s.icon,onSelect:()=>{navigate(s.id);setCommand(false);}}))}/>
 </div>;
}
