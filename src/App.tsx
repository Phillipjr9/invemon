import WithdrawalsPage from './pages/WithdrawalsPage';
import AdminPage from './pages/AdminPage';
import FundingPage from './pages/FundingPage';
import SupportPage from './pages/SupportPage';
import AccountLinkPage from './pages/AccountLinkPage';
import { useEffect, useState } from 'react';
import ThemeToggle from './components/ThemeToggle';
import { type InvestmentAccount } from './components/Dialogs';
import AccountDashboard from './pages/AccountDashboard';
import HomePage from './pages/HomePage';
import ServerAuthPage from './pages/ServerAuthPage';
import { SERVER_ACCOUNTS, api, accountAction } from './services/api';

type View = 'home' | 'signup' | 'login' | 'dashboard' | 'emails' | 'reset' | 'verify' | 'support' | 'funding' | 'admin' | 'withdrawals';
const getView = (): View => {
  const path = window.location.hash.slice(1).split('?')[0];
  if(path === 'deposit') return 'funding';
  return ['signup', 'login', 'dashboard', 'emails', 'reset', 'verify', 'support', 'funding', 'admin', 'withdrawals'].includes(path) ? path as View : 'home';
};
export default function App() {
  const [view, setView] = useState<View>(getView);
  const [sessionReady, setSessionReady] = useState(!SERVER_ACCOUNTS);
  const [sessionError, setSessionError] = useState('');
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
    const sync = () => { setView(getView()); };
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
    {view === 'admin' && <AdminPage />}
    {view === 'withdrawals' && <WithdrawalsPage />}
    {view === 'funding' && !sessionReady && <main className="login-main" role="status">Checking your account session…</main>}
    {view === 'funding' && sessionReady && <FundingPage account={SERVER_ACCOUNTS ? account : null} onBack={dashboard} onLogin={login} />}
    {view === 'support' && <SupportPage signedIn={SERVER_ACCOUNTS && Boolean(account?.serverUserId)} onBack={dashboard} onLogin={login} />}
    {(view === 'reset' || view === 'verify') && <AccountLinkPage key={view} purpose={view} onLogin={login} />}
    {view === 'emails' && <main className="funding-page"><h1>Email previews are not part of the customer account</h1><button className="db-btn" onClick={home}>Back to home</button></main>}
    {view === 'home' && <HomePage onSignup={signup} onLogin={login} onExplore={dashboard} onSupport={() => navigate('support')} />}
    {SERVER_ACCOUNTS && (view === 'signup' || view === 'login') && <ServerAuthPage key={view} register={view === 'signup'} onBack={home} onSwitch={view === 'signup' ? login : signup} onComplete={next => { setAccount(next); setSessionError(''); dashboard(); }} />}
    {sessionError && <div role="alert" className="account-service-notice">{sessionError} <button type="button" onClick={() => window.location.reload()}>Retry connection</button></div>}
    {view === 'dashboard' && !sessionReady && <main className="login-main" role="status">Checking your account session…</main>}
    {view === 'dashboard' && sessionReady && <AccountDashboard account={account} onAccount={setAccount} onBack={home} onLogin={login} onSignOut={() => { void (async () => { try { if (SERVER_ACCOUNTS && account?.serverUserId) await accountAction('logout'); localStorage.removeItem('invemon-account'); setAccount(null); home(); } catch (err) { setSessionError(err instanceof Error ? err.message : 'Sign out failed.'); } })(); }} />}

  </>;
}
