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
import { Wordmark } from './HomePage';
import './login-editorial.css';

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
      <aside className="login-panel editorial-panel">
        <img className="login-editorial-photo" src="/assets/new-york-flatiron.jpg" alt="New York’s Flatiron Building, looking upward" />
        <header className="login-panel-top">
          <button type="button" className="login-brand" onClick={onBack} aria-label="Back to Invemon website"><Wordmark light /></button>
          <button type="button" className="login-website-link" onClick={onBack}><Icon name="arrowLeft" size={15} /> Back to website</button>
        </header>
        <div className="login-editorial-copy"><span className="login-editorial-kicker">A LONGER-TERM PERSPECTIVE</span><h2>Great things <br />are built <br /><em>over time.</em></h2><p>A place for your investments.<br />A world of possibility ahead.</p></div>
        <footer className="login-editorial-footer"><span>NEW YORK, UNITED STATES</span><span>01 / A WORLD OF OPPORTUNITY</span></footer>
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
              <p className="login-lede">A clear view of your investments. A fresh perspective on what’s next.</p>

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
                  Log in <Icon name="arrow" size={17} />
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
                <Icon name="lock" size={14} /> Product preview. Use demo details, not a password you use elsewhere.
              </p>
            </section>
          )}
        </div>

        <footer className="login-legal">
          <span>© 2026 Invemon</span>
          <span>Demo environment · No real-money investing</span>
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
