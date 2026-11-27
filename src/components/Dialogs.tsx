import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type InvestmentAccount = {
  serverUserId?: string;
  emailVerified?: boolean;
  name: string;
  email: string;
  plan: string;
  goal?: string;
  risk?: string;
  monthlyAmount?: string;
  country?: string;
};

export type DialogState = { type: 'login' | 'account' | 'video' | 'support' | 'careers' } | null;

type Props = {
  dialog: DialogState;
  onClose: () => void;
  onOpen: (dialog: DialogState) => void;
  account: InvestmentAccount | null;
  onAccount: (account: InvestmentAccount | null) => void;
  onGoSignup?: () => void;
  onGoDashboard?: () => void;
};

function SuccessMark() {
  return <span className="success-mark"><Icon name="check" size={32} /></span>;
}

function goToSignup(onClose: () => void, onGoSignup?: () => void) {
  onClose();
  if (onGoSignup) { onGoSignup(); return; }
  window.setTimeout(() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function LoginForm({ account, onAccount, onOpen, onClose, onGoSignup, onGoDashboard }: { account: InvestmentAccount | null; onAccount: Props['onAccount']; onOpen: Props['onOpen']; onClose: () => void; onGoSignup?: () => void; onGoDashboard?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [complete, setComplete] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sameAccount = account?.email.toLowerCase() === email.trim().toLowerCase();
    const next: InvestmentAccount = sameAccount
      ? account!
      : { name: email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Investor', email: email.trim(), plan: 'Free' };
    try { localStorage.setItem('invemon-account', JSON.stringify(next)); } catch { /* Keep the session available when storage is unavailable. */ }
    onAccount(next);
    setComplete(true);
  };

  if (complete) return <div className="dialog-success"><SuccessMark /><h2 id="dialog-title">Welcome back.</h2><p>You're signed in as <strong>{account?.email}</strong>. Your investment profile is ready.</p><button className="button button-lime full-width" onClick={() => { onClose(); onGoDashboard?.(); }}>Open dashboard <Icon name="arrow" size={18} /></button><button className="sign-out" onClick={() => onOpen({ type: 'account' })}>View profile</button><small>Your session is stored on this device.</small></div>;

  return <><span className="dialog-eyebrow">Welcome back</span><h2 id="dialog-title">Sign in to Invemon.</h2><p className="dialog-description">Access your portfolio, automated investments, and market insights.</p><form className="dialog-form" onSubmit={submit}><label className="field">Email address<input data-autofocus type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required /></label><label className="field">Password<input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} /></label><button className="button button-lime full-width" type="submit">Sign in <Icon name="arrow" size={18} /></button></form><p className="dialog-switch">New to investing? <button onClick={() => goToSignup(onClose, onGoSignup)}>Create an account</button></p></>;
}

function Support() {
  return <><span className="dialog-eyebrow">We're here to help</span><h2 id="dialog-title">Help Center</h2><p className="dialog-description">Answers to common questions about creating an account and getting started.</p><div className="support-faq">{[
    ['How do I create an account?', 'Use the Sign Up form on the homepage. Enter your name, email, password, country, investment goal, risk profile, and monthly investment amount.'],
    ['How much do I need to start investing?', 'You can start with as little as $1. Choose a monthly amount that fits your goals and review your risk profile before investing.'],
    ['Is my money secure?', 'Invemon is currently a simulation. No brokerage or bank custody is connected. Do not send money or submit identity documents.'],
    ['Can I change my plan later?', 'Yes. You can review the pricing plans on this page and upgrade or change your plan from your account settings.'],
  ].map(([question, answer]) => <details key={question}><summary>{question}<Icon name="plus" size={20} /></summary><p>{answer}</p></details>)}</div><a className="button button-lime full-width" href="mailto:support@gravix.com"><Icon name="mail" size={18} />Contact support</a></>;
}

export default function Dialogs({ dialog, onClose, onOpen, account, onAccount, onGoSignup, onGoDashboard }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timeout = window.setTimeout(() => (ref.current?.querySelector('[data-autofocus]') as HTMLElement || ref.current?.querySelector('button'))?.focus(), 50);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, summary, [tabindex="0"]')).filter(item => item.offsetParent !== null);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { clearTimeout(timeout); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previousFocus?.focus({ preventScroll: true }); };
  }, [dialog?.type]);

  if (!dialog) return null;

  return createPortal(<div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`dialog dialog-${dialog.type}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}><button className="dialog-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" size={24} /></button><a className="dialog-brand" href="#home" onClick={onClose}><img src="/assets/Logo-brand-light.png" alt="Invemon" width="125" /></a><div key={dialog.type}>
    {dialog.type === 'login' && <LoginForm account={account} onAccount={onAccount} onOpen={onOpen} onClose={onClose} onGoSignup={onGoSignup} onGoDashboard={onGoDashboard} />}
    {dialog.type === 'support' && <Support />}
    {dialog.type === 'video' && <><span className="dialog-eyebrow">Discover Invemon</span><h2 id="dialog-title">Your investment journey, simplified.</h2><div className="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/VhBl3dHT5SY?autoplay=1&rel=0" title="Invemon video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div><div className="video-actions"><p>Ready to start investing?</p><button className="button button-lime" onClick={() => goToSignup(onClose, onGoSignup)}>Create your account <Icon name="arrow" size={18} /></button></div><a className="video-fallback" href="https://www.youtube.com/watch?v=VhBl3dHT5SY" target="_blank" rel="noreferrer">Video not loading? Open on YouTube <Icon name="external" size={14} /></a></>}
    {dialog.type === 'careers' && <><span className="dialog-eyebrow">Grow with us</span><h2 id="dialog-title">Build the future of investing.</h2><p className="dialog-description">We believe finance should be accessible to everyone. Our work brings together technology, thoughtful design, and a passion for helping people grow.</p><div className="careers-note"><Icon name="user" size={32} /><h3>Join the team</h3><p>Send your resume and tell us how you want to help people invest with confidence.</p></div><a className="button button-lime full-width" href="mailto:support@gravix.com?subject=Invemon%20career%20opportunities">Get in touch <Icon name="arrow" size={18} /></a></>}
    {dialog.type === 'account' && <><span className="dialog-eyebrow">Your account</span><h2 id="dialog-title">Welcome, {account?.name || 'investor'}.</h2><p className="dialog-description">Keep learning. Keep growing.</p><dl className="account-details"><div><dt>Email</dt><dd>{account?.email}</dd></div><div><dt>Selected plan</dt><dd>{account?.plan} Plan</dd></div>{account?.goal && <div><dt>Investment goal</dt><dd>{account.goal}</dd></div>}{account?.risk && <div><dt>Risk profile</dt><dd>{account.risk}</dd></div>}{account?.monthlyAmount && <div><dt>Monthly investment</dt><dd>${account.monthlyAmount}</dd></div>}{account?.country && <div><dt>Country</dt><dd>{account.country}</dd></div>}</dl>{onGoDashboard && <button className="button button-lime full-width" onClick={() => { onClose(); onGoDashboard(); }}>Open dashboard <Icon name="arrow" size={18} /></button>}<button className="sign-out" onClick={() => goToSignup(onClose, onGoSignup)}>Update investment profile</button><button className="sign-out" onClick={() => { try { localStorage.removeItem('invemon-account'); } catch { /* No saved profile to clear. */ } onAccount(null); onClose(); }}>Sign out</button></>}
  </div></div></div>, document.body);
}
