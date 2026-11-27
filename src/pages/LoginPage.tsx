import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import Icon from '../components/Icon';
import type { InvestmentAccount } from '../components/Dialogs';
import {
  GOOGLE_DEMO_ACCOUNTS,
  decodeJwtPayload,
  evaluatePassword,
  findRegisteredUser,
  hashPassword,
  loadGoogleIdentityScript,
  persistActiveSession,
  saveRegisteredUser,
  type StoredUserRecord,
} from '../services/auth';
import './auth.css';
import './login.css';

type Props = {
  account: InvestmentAccount | null;
  onAccount: (account: InvestmentAccount | null) => void;
  onBack: () => void;
  onComplete: () => void;
  onGoSignup: () => void;
};

type AuthMethod = 'password' | 'otp' | 'passkey';
type SubFlow = 'signin' | 'twofa' | 'forgot-email' | 'forgot-reset';

const PREVIEW_OTP = '482910';
const RECOVERY_OTP = '739204';

const VERIFY_STEPS = [
  'Verifying credentials',
  'Opening secure session',
  'Loading your portfolio',
];

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24Z" />
      <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9Z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-2.9 3.6-5 6.8-5Z" />
    </svg>
  );
}

function OtpInputs({
  digits,
  onChange,
}: {
  digits: string[];
  onChange: (next: string[]) => void;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigit = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = clean;
    onChange(next);
    if (clean && idx < 5) inputsRef.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    event.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => text[i] || '');
    onChange(next);
    inputsRef.current[Math.min(5, text.length)]?.focus();
  };

  return (
    <div className="login-otp-row" aria-label="6-digit verification code">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={el => { inputsRef.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          onChange={e => handleDigit(idx, e.target.value)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${idx + 1}`}
        />
      ))}
    </div>
  );
}

type PreviewTF = '1D' | '1W' | '1M' | '1Y';

const PREVIEW_SERIES: Record<PreviewTF, { start: number; end: number; benchEnd: number; labels: string[]; seed: number }> = {
  '1D': { start: 127182.44, end: 128430.62, benchEnd: 127980.1, labels: ['9:30a', '11a', '12:30p', '2p', '4p'], seed: 11 },
  '1W': { start: 124860.0, end: 128430.62, benchEnd: 126940.4, labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], seed: 29 },
  '1M': { start: 118940.0, end: 128430.62, benchEnd: 124180.9, labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'], seed: 47 },
  '1Y': { start: 96400.0, end: 128430.62, benchEnd: 118520.3, labels: ['Q1', 'Q2', 'Q3', 'Q4'], seed: 83 },
};

const PREVIEW_HOLDINGS = [
  { symbol: 'VTI', name: 'Vanguard Total Market', meta: 'ETF · 42.6%', value: '$54,714', change: '+0.42%', up: true, tone: 'is-etf', spark: [42, 40, 41, 38, 39, 35, 36, 32, 33, 29, 30, 26] },
  { symbol: 'AAPL', name: 'Apple Inc.', meta: 'Stock · 18.2%', value: '$23,382', change: '+1.82%', up: true, tone: '', spark: [38, 39, 36, 37, 33, 34, 31, 32, 28, 29, 25, 22] },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', meta: 'Stock · 9.4%', value: '$12,072', change: '+2.41%', up: true, tone: 'is-chip', spark: [44, 42, 43, 39, 40, 35, 36, 31, 32, 27, 28, 22] },
  { symbol: 'BND', name: 'Total Bond Market', meta: 'Bonds · 11.9%', value: '$15,290', change: '−0.18%', up: false, tone: 'is-bond', spark: [26, 27, 26, 28, 27, 29, 28, 30, 29, 31, 30, 32] },
];

const PREVIEW_ALLOC = [
  { label: 'Stocks', pct: 42, color: '#C9A66B' },
  { label: 'ETFs', pct: 27, color: '#5B6B8C' },
  { label: 'Bonds', pct: 12, color: '#7280C7' },
  { label: 'Crypto', pct: 10, color: '#8A6D3B' },
  { label: 'Cash', pct: 9, color: '#E8DCC8' },
];

function mulberry(seed: number) {
  let x = seed;
  return () => {
    x |= 0; x = (x + 0x6D2B79F5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genWalk(seed: number, n: number, start: number, end: number, wobble: number): number[] {
  const rnd = mulberry(seed);
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i += 1) {
    const drift = (end - start) / (n - 1);
    v += drift + (rnd() - 0.485) * wobble * (end - start);
    out.push(v);
  }
  out[0] = start;
  out[n - 1] = end;
  return out;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const fmtMoney0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMoney2 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function ProductPreview() {
  const [tf, setTf] = useState<PreviewTF>('1M');
  const [hover, setHover] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setTick(t => t + 1), 3200);
    return () => window.clearInterval(id);
  }, []);

  const cfg = PREVIEW_SERIES[tf];
  const N = 28;
  const series = useMemo(() => genWalk(cfg.seed, N, cfg.start, cfg.end, 0.055), [cfg.seed, cfg.start, cfg.end]);
  const bench = useMemo(() => genWalk(cfg.seed + 999, N, cfg.start, cfg.benchEnd, 0.05), [cfg.seed, cfg.start, cfg.benchEnd]);

  const W = 520; const H = 148; const PL = 6; const PR = 6; const PT = 10; const PB = 22;
  const all = [...series, ...bench];
  const min = Math.min(...all); const max = Math.max(...all);
  const span = max - min || 1;
  const X = (i: number) => PL + (i / (N - 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - min) / span) * (H - PT - PB);
  const pts = series.map((v, i) => ({ x: X(i), y: Y(v) }));
  const benchPts = bench.map((v, i) => ({ x: X(i), y: Y(v) }));
  const line = smoothPath(pts);
  const area = `${line} L${X(N - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z`;
  const benchLine = smoothPath(benchPts);

  const change = cfg.end - cfg.start;
  const changePct = (change / cfg.start) * 100;
  const liveBump = (tick % 2 === 0 ? 1 : -1) * (cfg.end * 0.0004);
  const liveValue = cfg.end + liveBump;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (N - 1)));
  };

  return (
    <div className="login-preview showcase" aria-label="Interactive portfolio preview">
      <div className="showcase-topbar">
        <span className="showcase-live"><i /> NYSE · Open</span>
        <span className="showcase-benchmark">S&P 500 <b>6,142.80</b> <em>+0.62%</em></span>
      </div>

      <div className="showcase-balance">
        <div>
          <span>Total net worth</span>
          <strong key={tf + tick}>{fmtMoney2(liveValue)}</strong>
        </div>
        <div className="showcase-deltas">
          <span className="showcase-pill is-up">▲ {fmtMoney0(change)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)</span>
          <span className="showcase-range">{tf} · vs S&P 500</span>
        </div>
      </div>

      <div className="showcase-tabs" role="tablist" aria-label="Preview timeframe">
        {(Object.keys(PREVIEW_SERIES) as PreviewTF[]).map(k => (
          <button key={k} type="button" role="tab" aria-selected={tf === k} className={tf === k ? 'is-active' : ''} onClick={() => { setTf(k); setHover(null); }}>
            {k}
          </button>
        ))}
        <span className="showcase-updated">Updated just now</span>
      </div>

      <div className="showcase-chart" ref={wrapRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sample portfolio trend over ${tf}`}>
          <defs>
            <linearGradient id="showcase-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A66B" stopOpacity=".30" />
              <stop offset="100%" stopColor="#C9A66B" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[36, 76, 116].map(y => (
            <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="#232C42" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#showcase-fill)" />
          <path d={benchLine} fill="none" stroke="#5B6B8C" strokeWidth="1.5" strokeDasharray="5 5" opacity=".85" />
          <path key={tf} className="showcase-line-draw" d={line} fill="none" stroke="#C9A66B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {hover === null ? (
            <g className="showcase-live-dot">
              <circle cx={X(N - 1)} cy={Y(series[N - 1])} r="9" fill="#C9A66B" opacity=".18" />
              <circle cx={X(N - 1)} cy={Y(series[N - 1])} r="4" fill="#C9A66B" stroke="#07090F" strokeWidth="1.5" />
            </g>
          ) : (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={PT - 4} y2={H - PB + 4} stroke="#8E99B2" strokeWidth="1" strokeDasharray="3 4" />
              <circle cx={X(hover)} cy={Y(series[hover])} r="4.5" fill="#0E131C" stroke="#C9A66B" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover !== null ? (
          <div className="showcase-tip" style={{ left: `${(hover / (N - 1)) * 100}%` }}>
            <strong>{fmtMoney0(series[hover])}</strong>
            <span>{cfg.labels[Math.min(cfg.labels.length - 1, Math.floor((hover / (N - 1)) * cfg.labels.length))]}</span>
          </div>
        ) : null}
        <div className="showcase-xlabels" aria-hidden="true">
          {cfg.labels.map(l => <span key={l}>{l}</span>)}
        </div>
      </div>

      <div className="showcase-stats">
        <div><span>Invested</span><strong>$118.2K</strong></div>
        <div><span>Cash sweep</span><strong>4.65% <small>APY</small></strong></div>
        <div><span>Dividends YTD</span><strong className="is-gold">+$842.16</strong></div>
      </div>

      <ul className="showcase-holdings">
        {PREVIEW_HOLDINGS.map((h, idx) => {
          const ptsSpark = h.spark.map((v, i) => `${(i / (h.spark.length - 1)) * 76},${34 - ((v - 22) / 24) * 28}`).join(' ');
          return (
            <li key={h.symbol} style={{ animationDelay: `${idx * 70}ms` }}>
              <span className={`login-asset-mark ${h.tone}`}>{h.symbol.slice(0, 4)}</span>
              <span className="showcase-holding-meta"><strong>{h.symbol}</strong><small>{h.name}</small></span>
              <svg className="showcase-spark" viewBox="0 0 76 36" aria-hidden="true">
                <polyline points={ptsSpark} fill="none" stroke={h.up ? '#C9A66B' : '#8E99B2'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span className="showcase-holding-right"><b>{h.value}</b><em className={h.up ? 'is-up' : 'is-down'}>{h.change}</em></span>
            </li>
          );
        })}
      </ul>

      <div className="showcase-alloc" aria-label="Sample allocation">
        <div className="showcase-alloc-bar">
          {PREVIEW_ALLOC.map(a => (
            <span key={a.label} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.label} ${a.pct}%`} />
          ))}
        </div>
        <div className="showcase-alloc-legend">
          {PREVIEW_ALLOC.map(a => (
            <span key={a.label}><i style={{ background: a.color }} />{a.label} <b>{a.pct}%</b></span>
          ))}
        </div>
      </div>

      <div className="showcase-activity">
        <span><i className="dot" /> Auto-invest $250 → VTI · executed</span>
        <span><i className="dot gold" /> Dividend +$42.18 · SCHD reinvested</span>
      </div>
    </div>
  );
}

export default function LoginPage({ account, onAccount, onBack, onComplete, onGoSignup }: Props) {
  const [method, setMethod] = useState<AuthMethod>('password');
  const [subFlow, setSubFlow] = useState<SubFlow>('signin');
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(0);
  const [passkeyScanning, setPasskeyScanning] = useState(false);
  const [pendingUser, setPendingUser] = useState<StoredUserRecord | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [showChooser, setShowChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [verifyingIndex, setVerifyingIndex] = useState<number | null>(null);

  const googleButtonRef = useRef<HTMLDivElement>(null);
  const clientId = (import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }).env?.VITE_GOOGLE_CLIENT_ID;
  const resetStrength = useMemo(() => evaluatePassword(newPassword), [newPassword]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = window.setTimeout(() => setResendTimer(t => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendTimer]);

  const finishSignIn = (user: InvestmentAccount) => {
    persistActiveSession(user);
    onAccount(user);
    setVerifyingIndex(0);
    window.setTimeout(() => setVerifyingIndex(1), 350);
    window.setTimeout(() => setVerifyingIndex(2), 700);
    window.setTimeout(() => onComplete(), 1080);
  };

  const resolveOrCreateProfile = (userEmail: string, fallbackName?: string): StoredUserRecord => {
    const cleanEmail = userEmail.trim().toLowerCase();
    const existing = findRegisteredUser(cleanEmail);
    if (existing) return existing;
    if (account && account.email.toLowerCase() === cleanEmail) return account;
    return {
      name: fallbackName || cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Private Client',
      email: cleanEmail,
      plan: 'Pro',
      goal: 'Long-term growth',
      risk: 'Balanced',
      monthlyAmount: '250',
      country: 'United States',
    };
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setStatusNote('');
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    const registered = findRegisteredUser(cleanEmail);
    if (registered?.passwordHash) {
      const enteredHash = await hashPassword(password);
      if (enteredHash !== registered.passwordHash) {
        setError('Incorrect password for this account. Try again or use Forgot password.');
        return;
      }
      if (registered.twoFactorMethod && registered.twoFactorMethod !== 'none') {
        setPendingUser(registered);
        setOtpDigits(['', '', '', '', '', '']);
        setSubFlow('twofa');
        return;
      }
      finishSignIn(registered);
      return;
    }

    finishSignIn(resolveOrCreateProfile(cleanEmail));
  };

  const handleSendOtp = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address to receive your one-time code.');
      return;
    }
    setOtpSent(true);
    setOtpDigits(['', '', '', '', '', '']);
    setResendTimer(30);
    setStatusNote(`A 6-digit verification code was issued for ${email.trim()}.`);
  };

  const handleVerifyOtp = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }
    if (code !== PREVIEW_OTP) {
      setError(`Invalid code. For this interactive preview, enter ${PREVIEW_OTP}.`);
      return;
    }
    finishSignIn(resolveOrCreateProfile(email));
  };

  const handleVerifyTwoFa = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length < 6) {
      setError('Enter all 6 digits from your authenticator.');
      return;
    }
    if (code !== PREVIEW_OTP) {
      setError(`Code not recognized. Enter preview authenticator code ${PREVIEW_OTP}.`);
      return;
    }
    if (pendingUser) finishSignIn(pendingUser);
  };

  const handlePasskeyScan = () => {
    setError('');
    setPasskeyScanning(true);
    window.setTimeout(() => {
      setPasskeyScanning(false);
      finishSignIn(resolveOrCreateProfile(email.trim() || 'alex.morgan@invemon.com', 'Alex Morgan'));
    }, 950);
  };

  const handleStartRecovery = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setError('Please enter the email address associated with your account.');
      return;
    }
    setResetCode(['', '', '', '', '', '']);
    setSubFlow('forgot-reset');
  };

  const handleFinishRecovery = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const code = resetCode.join('');
    if (code !== RECOVERY_OTP) {
      setError(`Invalid recovery code. Enter preview code ${RECOVERY_OTP}.`);
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    const existing = resolveOrCreateProfile(resetEmail);
    const passwordHash = await hashPassword(newPassword);
    saveRegisteredUser({ ...existing, passwordHash });
    setEmail(existing.email);
    setPassword('');
    setNewPassword('');
    setSubFlow('signin');
    setMethod('password');
    setStatusNote('Your password has been updated. Sign in with your new credentials.');
  };

  const signInWithGoogleProfile = (profile: { name: string; email: string }) => {
    setShowChooser(false);
    finishSignIn(resolveOrCreateProfile(profile.email, profile.name));
  };

  const switchMethod = (next: AuthMethod) => {
    setMethod(next);
    setError('');
    setStatusNote('');
    if (next !== 'otp') setOtpSent(false);
  };

  const backToSignIn = () => {
    setSubFlow('signin');
    setMethod('password');
    setError('');
    setStatusNote('');
    setOtpSent(false);
  };

  useEffect(() => {
    if (!clientId || !googleButtonRef.current || subFlow !== 'signin' || method !== 'password') return;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        const google = (window as unknown as { google?: { accounts?: { id?: { initialize: (c: unknown) => void; renderButton: (el: HTMLElement, o: unknown) => void } } } }).google;
        google?.accounts?.id?.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => {
            try {
              const profile = decodeJwtPayload(response.credential);
              if (profile.email) {
                signInWithGoogleProfile({
                  name: profile.name || profile.email.split('@')[0],
                  email: profile.email,
                });
              }
            } catch {
              setError('Google sign-in could not be completed. Try password or email code.');
            }
          },
        });
        google?.accounts?.id?.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 400,
          text: 'signin_with',
        });
      })
      .catch(() => { /* Fallback Google button remains available. */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, subFlow, method]);

  return (
    <div className="login-shell">
      <aside className="login-panel">
        <header className="login-panel-top">
          <button type="button" className="login-brand" onClick={onBack} aria-label="Back to Invemon website">
            <img src="/assets/Logo-brand-dark.png" alt="Invemon" width="132" />
          </button>
          <button type="button" className="login-website-link" onClick={onBack}>
            <Icon name="arrowLeft" size={15} /> Website
          </button>
        </header>

        <div className="login-panel-copy">
          <p><i className="login-kicker-dot" /> Private client access</p>
          <h2>Private wealth,<br /><em>quietly compounded.</em></h2>
          <span>A live look at the calm, confident portfolio workspace waiting behind this sign-in.</span>
        </div>

        <ProductPreview />

        <footer className="login-panel-footer">
          <span><Icon name="lock" size={14} /> 256-bit encrypted session</span>
          <span><Icon name="shield" size={14} /> SIPC-protected brokerage</span>
        </footer>
      </aside>

      <main className="login-main">
        <div className="login-form-wrap">
          {verifyingIndex !== null ? (
            <div className="login-processing" role="status" aria-live="polite">
              <span className="login-spinner" aria-hidden="true" />
              <h1>Signing you in</h1>
              <p>Checking your credentials and preparing your portfolio.</p>
              <div className="login-processing-steps">
                {VERIFY_STEPS.map((label, idx) => (
                  <div key={label} className={idx <= verifyingIndex ? 'is-done' : ''}>
                    <Icon name={idx <= verifyingIndex ? 'check' : 'clock'} size={15} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : subFlow === 'twofa' ? (
            <section className="login-section" aria-labelledby="twofa-title">
              <button type="button" className="login-back" onClick={backToSignIn}>
                <Icon name="arrowLeft" size={15} /> Back
              </button>
              <span className="login-step-icon"><Icon name="shield" size={20} /></span>
              <h1 id="twofa-title">Two-step verification</h1>
              <p className="login-lede">Enter the 6-digit code from your authenticator for <strong>{pendingUser?.email}</strong>.</p>

              {error && <div className="login-alert is-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}
              <p className="login-preview-note">Preview code: <strong>{PREVIEW_OTP}</strong></p>

              <form className="login-form" onSubmit={handleVerifyTwoFa}>
                <OtpInputs digits={otpDigits} onChange={setOtpDigits} />
                <button type="submit" className="login-primary">Verify and continue</button>
              </form>
            </section>
          ) : subFlow === 'forgot-email' ? (
            <section className="login-section" aria-labelledby="forgot-title">
              <button type="button" className="login-back" onClick={backToSignIn}>
                <Icon name="arrowLeft" size={15} /> Back to sign in
              </button>
              <h1 id="forgot-title">Reset your password</h1>
              <p className="login-lede">Enter the email address for your Invemon account. We’ll send a recovery code.</p>

              {error && <div className="login-alert is-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}

              <form className="login-form" onSubmit={handleStartRecovery} noValidate>
                <div className="login-field">
                  <label htmlFor="recovery-email">Account email address</label>
                  <input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@domain.com"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="login-primary">Send recovery code</button>
              </form>
            </section>
          ) : subFlow === 'forgot-reset' ? (
            <section className="login-section" aria-labelledby="reset-title">
              <button type="button" className="login-back" onClick={() => { setSubFlow('forgot-email'); setError(''); }}>
                <Icon name="arrowLeft" size={15} /> Back
              </button>
              <h1 id="reset-title">Create a new password</h1>
              <p className="login-lede">Enter the recovery code sent to <strong>{resetEmail}</strong>, then choose a new password.</p>

              {error && <div className="login-alert is-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}
              <p className="login-preview-note">Preview recovery code: <strong>{RECOVERY_OTP}</strong></p>

              <form className="login-form" onSubmit={handleFinishRecovery} noValidate>
                <OtpInputs digits={resetCode} onChange={setResetCode} />
                <div className="login-field">
                  <label htmlFor="reset-new-password">New password</label>
                  <div className="login-password-wrap">
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} aria-label="Toggle password visibility">
                      <Icon name={showPassword ? 'eyeoff' : 'eye'} size={17} />
                    </button>
                  </div>
                  <small className="login-strength">Password strength: <strong>{resetStrength.label}</strong></small>
                </div>
                <button type="submit" className="login-primary">Update password</button>
              </form>
            </section>
          ) : method === 'otp' ? (
            <section className="login-section" aria-labelledby="otp-title">
              <button type="button" className="login-back" onClick={() => switchMethod('password')}>
                <Icon name="arrowLeft" size={15} /> Back to sign in
              </button>
              <h1 id="otp-title">{otpSent ? 'Check your email' : 'Sign in with a code'}</h1>
              <p className="login-lede">
                {otpSent
                  ? <>Enter the 6-digit code sent to <strong>{email}</strong>.</>
                  : 'We’ll email you a one-time code. No password needed.'}
              </p>

              {error && <div className="login-alert is-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}
              {statusNote && !otpSent && <div className="login-alert is-success" role="status"><Icon name="check" size={16} /><span>{statusNote}</span></div>}

              {!otpSent ? (
                <form className="login-form" onSubmit={handleSendOtp} noValidate>
                  <div className="login-field">
                    <label htmlFor="otp-email">Client email address</label>
                    <input
                      id="otp-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@domain.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="login-primary">Send sign-in code</button>
                </form>
              ) : (
                <form className="login-form" onSubmit={handleVerifyOtp}>
                  <p className="login-preview-note">Preview code: <strong>{PREVIEW_OTP}</strong></p>
                  <OtpInputs digits={otpDigits} onChange={setOtpDigits} />
                  <button type="submit" className="login-primary">Verify and continue</button>
                  <div className="login-inline-actions">
                    <button type="button" onClick={() => setOtpSent(false)}>Change email</button>
                    <button type="button" disabled={resendTimer > 0} onClick={() => setResendTimer(30)}>
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : method === 'passkey' ? (
            <section className="login-section login-passkey" aria-labelledby="passkey-title">
              <button type="button" className="login-back" onClick={() => switchMethod('password')}>
                <Icon name="arrowLeft" size={15} /> Back to sign in
              </button>
              <span className={`login-passkey-icon ${passkeyScanning ? 'is-scanning' : ''}`}>
                <Icon name="fingerprint" size={30} />
              </span>
              <h1 id="passkey-title">Use your passkey</h1>
              <p className="login-lede">Use Face ID, Touch ID, Windows Hello or a security key to sign in without a password.</p>

              {error && <div className="login-alert is-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}

              <button type="button" className="login-primary" disabled={passkeyScanning} onClick={handlePasskeyScan}>
                {passkeyScanning ? 'Waiting for device…' : 'Continue with passkey'}
              </button>
              <p className="login-microcopy">Passkeys are phishing-resistant and never share your password with a website.</p>
            </section>
          ) : (
            <section className="login-section" aria-labelledby="login-title">
              <p className="login-welcome">Welcome back</p>
              <h1 id="login-title">Sign in to Invemon</h1>
              <p className="login-lede">Access your portfolio, cash sweep and automatic investments.</p>

              {error && (
                <div className="login-alert is-error" role="alert">
                  <Icon name="alert" size={16} /><span>{error}</span>
                </div>
              )}
              {statusNote && (
                <div className="login-alert is-success" role="status">
                  <Icon name="check" size={16} /><span>{statusNote}</span>
                </div>
              )}

              <div className="login-auth-options">
                {clientId ? (
                  <div ref={googleButtonRef} className="google-button-slot" />
                ) : (
                  <button type="button" className="login-provider" onClick={() => setShowChooser(true)}>
                    <GoogleMark /> Continue with Google
                  </button>
                )}
                <button type="button" className="login-provider" onClick={() => switchMethod('passkey')}>
                  <Icon name="fingerprint" size={18} /> Continue with passkey
                </button>
              </div>

              <div className="login-divider"><span>or continue with email</span></div>

              <form className="login-form" onSubmit={handlePasswordSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="login-field">
                  <div className="login-label-row">
                    <label htmlFor="login-password">Password</label>
                    <button
                      type="button"
                      className="login-text-link"
                      onClick={() => {
                        setResetEmail(email);
                        setError('');
                        setStatusNote('');
                        setSubFlow('forgot-email');
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="login-password-wrap">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPassword ? 'eyeoff' : 'eye'} size={17} />
                    </button>
                  </div>
                </div>

                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={e => setRememberDevice(e.target.checked)}
                  />
                  <span>Remember this device for 30 days</span>
                </label>

                <button type="submit" className="login-primary">
                  Sign In to Wealth Portal <Icon name="arrow" size={17} />
                </button>
              </form>

              <button type="button" className="login-code-link" onClick={() => switchMethod('otp')}>
                Sign in with a one-time email code instead
              </button>

              <div className="login-create-account">
                <span>New to Invemon?</span>
                <button type="button" onClick={onGoSignup}>Create an account</button>
              </div>

              <p className="login-security-note">
                <Icon name="lock" size={14} /> Protected by encrypted sessions and optional two-step verification.
              </p>
            </section>
          )}
        </div>

        <footer className="login-legal">
          <span>© 2025 Invemon</span>
          <span>Privacy</span>
          <span>Terms</span>
          <span>Security</span>
        </footer>
      </main>

      {showChooser && (
        <div className="chooser-backdrop" onClick={() => setShowChooser(false)}>
          <div className="chooser" role="dialog" aria-modal="true" aria-labelledby="login-chooser-title" onClick={event => event.stopPropagation()}>
            <div className="chooser-head">
              <GoogleMark />
              <h3 id="login-chooser-title">Sign in with Google</h3>
              <p>Choose an account to continue to <strong>Invemon Wealth</strong></p>
            </div>
            {GOOGLE_DEMO_ACCOUNTS.map(item => (
              <button key={item.email} type="button" className="chooser-account" onClick={() => signInWithGoogleProfile(item)}>
                <span className="chooser-avatar">{item.avatar}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.email} · {item.role}</small>
                </span>
              </button>
            ))}
            <form
              className="login-google-custom"
              onSubmit={e => {
                e.preventDefault();
                if (!customGoogleEmail.includes('@')) return;
                signInWithGoogleProfile({
                  name: customGoogleEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
                  email: customGoogleEmail.trim(),
                });
              }}
            >
              <label htmlFor="custom-google-email">Or use another Google email</label>
              <input
                id="custom-google-email"
                type="email"
                placeholder="yourname@gmail.com"
                value={customGoogleEmail}
                onChange={e => setCustomGoogleEmail(e.target.value)}
              />
              {customGoogleEmail.trim() && (
                <button type="submit" className="login-primary">Continue with {customGoogleEmail.trim()}</button>
              )}
            </form>
            <button type="button" className="chooser-cancel" onClick={() => setShowChooser(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
