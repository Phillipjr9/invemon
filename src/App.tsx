import SupportPage from './pages/SupportPage';
import AccountLinkPage from './pages/AccountLinkPage';
import { useEffect, useState } from 'react';
import EmailStudio from './pages/EmailStudio';
import ThemeToggle from './components/ThemeToggle';
import Dialogs, { type DialogState, type InvestmentAccount } from './components/Dialogs';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import ServerAuthPage from './pages/ServerAuthPage';
import ServerAccountTools from './components/ServerAccountTools';
import { SERVER_ACCOUNTS, api, accountAction } from './services/api';

type View = 'home' | 'signup' | 'login' | 'dashboard' | 'emails' | 'reset' | 'verify' | 'support';
const getView = (): View => {
  const path = window.location.hash.slice(1).split('?')[0];
  return ['signup', 'login', 'dashboard', 'emails', 'reset', 'verify', 'support'].includes(path) ? path as View : 'home';
};
export default function App() {
  const [view, setView] = useState<View>(getView);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sessionReady, setSessionReady] = useState(!SERVER_ACCOUNTS);
  const [sessionError, setSessionError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('Free');
  const [account, setAccount] = useState<InvestmentAccount | null>(() => {
    if (SERVER_ACCOUNTS) return null;
    try { return JSON.parse(localStorage.getItem('invemon-account') || 'null'); } catch { return null; }
  });
  useEffect(() => {
    if (!SERVER_ACCOUNTS) return;
    let active = true;
    api<{account: InvestmentAccount | null}>('account').then(result => { if (active) setAccount(result.account); }).catch(err => { if (active) setSessionError(err.message); }).finally(() => { if (active) setSessionReady(true); });
    return () => { active = false; };
  }, []);
  const navigate = (next: View) => { window.location.hash = next === 'home' ? '' : next; setView(next); };
  useEffect(() => {
    const sync = () => { setView(getView()); setDialog(null); };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); document.title = `${view === 'home' ? 'Invest with perspective' : view.charAt(0).toUpperCase() + view.slice(1)} — Invemon`; }, [view]);
  const home = () => navigate('home');
  const signup = () => navigate('signup');
  const login = () => navigate('login');
  const dashboard = () => navigate('dashboard');
  return <>
    <ThemeToggle />
    {view === 'support' && <SupportPage signedIn={SERVER_ACCOUNTS && Boolean(account?.serverUserId)} onBack={dashboard} onLogin={login} />}
    {(view === 'reset' || view === 'verify') && <AccountLinkPage key={view} purpose={view} onLogin={login} />}
    {view === 'emails' && <EmailStudio onBack={account ? dashboard : home} />}
    {view === 'home' && <HomePage onSignup={signup} onLogin={login} onExplore={dashboard} onSupport={() => setDialog({ type: 'support' })} />}
    {SERVER_ACCOUNTS && (view === 'signup' || view === 'login') && <ServerAuthPage key={view} register={view === 'signup'} onBack={home} onSwitch={view === 'signup' ? login : signup} onComplete={next => { setAccount(next); setSessionError(''); dashboard(); }} />}
    {!SERVER_ACCOUNTS && view === 'signup' && <SignupPage account={account} onAccount={setAccount} selectedPlan={selectedPlan} onPlanChange={setSelectedPlan} onBack={home} onComplete={dashboard} onSignIn={login} />}
    {!SERVER_ACCOUNTS && view === 'login' && <LoginPage account={account} onAccount={setAccount} onBack={home} onComplete={dashboard} onGoSignup={signup} />}
    {sessionError && <div role="alert" className="account-service-notice">{sessionError} <button type="button" onClick={() => window.location.reload()}>Retry connection</button></div>}
    {view === 'dashboard' && !sessionReady && <main className="login-main" role="status">Checking your account session…</main>}
    {view === 'dashboard' && sessionReady && <DashboardPage key={account?.serverUserId || account?.email || 'guest'} account={account} onAccount={setAccount} onBack={home} onSignUp={signup} onOpenSupport={() => setDialog({ type: 'support' })} onOpenCareers={() => setDialog({ type: 'careers' })} onOpenProfile={() => setDialog({ type: 'account' })} onSignOut={() => { void (async () => { try { if (SERVER_ACCOUNTS && account?.serverUserId) await accountAction('logout'); localStorage.removeItem('invemon-account'); setAccount(null); home(); } catch (err) { setSessionError(err instanceof Error ? err.message : 'Sign out failed.'); } })(); }} />}
    {!SERVER_ACCOUNTS && <Dialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} account={account} onAccount={setAccount} onGoSignup={signup} onGoDashboard={dashboard} />}
    {SERVER_ACCOUNTS && dialog && <div className="db-modal-backdrop" onClick={() => setDialog(null)}><section role="dialog" aria-modal="true" aria-label="Account services" className="db-modal" onClick={event => event.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}><button type="button" className="db-btn" onClick={() => setDialog(null)}>Close</button>{account?.serverUserId ? <ServerAccountTools account={account} onAccount={setAccount} onSignedOut={() => { setDialog(null); home(); }} /> : <><h2>Account services</h2><p>Sign in to manage your account or send a support request. Do not submit personal financial details.</p><button type="button" className="db-btn" onClick={() => { setDialog(null); login(); }}>Sign in</button></>}</section></div>}
  </>;
}
