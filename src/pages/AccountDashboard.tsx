import {useState} from 'react';
import type {InvestmentAccount} from '../components/Dialogs';
import ServerAccountTools from '../components/ServerAccountTools';
import EmailNotifications from '../components/EmailNotifications';
import {Wordmark} from './HomePage';
import './funding-page.css';
import './dashboard.css';
export default function AccountDashboard({account,onAccount,onBack,onLogin,onSignOut}:{account:InvestmentAccount|null;onAccount:(value:InvestmentAccount|null)=>void;onBack:()=>void;onLogin:()=>void;onSignOut:()=>void}){
 const [settings,setSettings]=useState(false);
 return <main className="funding-page"><header><button className="account-brand" onClick={onBack} aria-label="Invemon home"><Wordmark/></button><nav className="funding-row" aria-label="Account navigation"><button className="db-btn" onClick={()=>setSettings(false)}>Overview</button>{account&&<><a className="db-btn" href="#funding">Deposit</a><button className="db-btn" onClick={()=>setSettings(true)}>Settings</button><a className="db-btn" href="#support">Support</a><button className="db-btn" onClick={onSignOut}>Sign out</button></>}</nav></header>
 {!account?<section className="funding-intro"><span className="funding-eyebrow">YOUR ACCOUNT</span><h1>Your next chapter.</h1><p>Sign in to manage your account. Financial records are never loaded from browser storage.</p><button className="db-btn" onClick={onLogin}>Sign in</button></section>:settings?<section className="account-settings"><h1>Settings</h1><ServerAccountTools account={account} onAccount={onAccount} onSignedOut={onBack}/><EmailNotifications/></section>:<>
 <section className="funding-intro"><span className="funding-eyebrow">YOUR ACCOUNT</span><h1>Welcome, {account.name.split(' ')[0]}.</h1><p>A financial record should tell you what actually happened. Your account does not contain preloaded assets, invented returns or locally editable money.</p></section>
 <div className="funding-warning"><strong>Funding and investment execution are not yet open.</strong><p>Payment reconciliation and the financial ledger are being prepared. Do not send funds. Account registration does not open a brokerage or custodial investment account.</p></div>
 <div className="funding-grid"><section className="funding-card"><span className="funding-eyebrow">PORTFOLIO</span><h2>No recorded holdings</h2><p>No connected brokerage or custody positions are available. We do not display an estimated balance without verified records.</p><button className="db-btn" disabled>Investment execution unavailable</button></section><section className="funding-card"><span className="funding-eyebrow">FUNDING</span><h2>Every deposit, accounted for.</h2><p>View funding availability and payment history separately from account settings. An invoice is not a credited balance.</p><a className="db-btn" href="#funding">View deposit availability</a></section></div>
 <section className="funding-card" style={{marginTop:24}}><h2>No investment activity to show</h2><p>Actual executions and reconciled funding entries will appear here once those services are available. Recurring orders, swaps and withdrawals are not active.</p></section>
 </>}
 <footer>Invemon · No return is guaranteed. Financial services depend on supported jurisdictions, eligibility and approved providers.</footer></main>;
}
