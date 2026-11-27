import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import type { InvestmentAccount } from '../components/Dialogs';
import {
  COUNTRIES,
  GOOGLE_DEMO_ACCOUNTS,
  PLAN_TIERS,
  RISK_BLUEPRINTS,
  decodeJwtPayload,
  evaluatePassword,
  hashPassword,
  loadGoogleIdentityScript,
  projectTenYearValue,
  saveRegisteredUser,
  type StoredUserRecord,
} from '../services/auth';
import './auth.css';

type Props = {
  account: InvestmentAccount | null;
  onAccount: (account: InvestmentAccount | null) => void;
  selectedPlan: string;
  onPlanChange: (plan: string) => void;
  onBack: () => void;
  onComplete: () => void;
  onSignIn: () => void;
};

type Step = 1 | 2 | 3;

const GOALS = [
  { id: 'Long-term growth', subtitle: 'Compound capital over 5–20+ years' },
  { id: 'Retirement', subtitle: 'Tax-aware long-horizon wealth' },
  { id: 'Wealth building', subtitle: 'Multi-asset portfolio expansion' },
  { id: 'Income generation', subtitle: 'Dividends & 4.65% cash yield' },
];

const PROVISION_STEPS = [
  'Encrypting credentials & security keys',
  'Calibrating target portfolio allocation',
  'Activating 4.65% APY cash sweep account',
  'Preparing your Invemon Wealth Portal',
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

const fmtCurrency = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function SignupPage({
  account,
  onAccount,
  selectedPlan,
  onPlanChange,
  onBack,
  onComplete,
  onSignIn,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [country, setCountry] = useState(account?.country || 'United States');
  const [goal, setGoal] = useState(account?.goal || 'Long-term growth');
  const [risk, setRisk] = useState<'Conservative' | 'Balanced' | 'Growth' | 'Aggressive'>(
    (account?.risk as 'Conservative' | 'Balanced' | 'Growth' | 'Aggressive') || 'Balanced',
  );
  const [monthlyAmount, setMonthlyAmount] = useState(account?.monthlyAmount || '250');
  const [accountType, setAccountType] = useState<'Individual' | 'Joint' | 'Retirement'>('Individual');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'authenticator' | 'email' | 'none'>('authenticator');
  const [terms, setTerms] = useState(false);
  const [formError, setFormError] = useState('');
  const [showChooser, setShowChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [googleError, setGoogleError] = useState('');
  const [provisioningIndex, setProvisioningIndex] = useState<number | null>(null);

  const googleButtonRef = useRef<HTMLDivElement>(null);
  const clientId = (import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }).env?.VITE_GOOGLE_CLIENT_ID;

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const activeBlueprint = useMemo(
    () => RISK_BLUEPRINTS.find(item => item.id === risk) || RISK_BLUEPRINTS[1],
    [risk],
  );
  const monthlyNum = Math.max(25, Number(monthlyAmount) || 250);
  const projectedTenYr = useMemo(
    () => projectTenYearValue(monthlyNum, activeBlueprint.expectedReturn),
    [monthlyNum, activeBlueprint.expectedReturn],
  );

  const runProvisioningAndFinish = (record: StoredUserRecord) => {
    saveRegisteredUser(record);
    onAccount(record);
    setProvisioningIndex(0);
    window.setTimeout(() => setProvisioningIndex(1), 360);
    window.setTimeout(() => setProvisioningIndex(2), 720);
    window.setTimeout(() => setProvisioningIndex(3), 1080);
    window.setTimeout(() => {
      onComplete();
    }, 1480);
  };

  const handleStepOneNext = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (name.trim().length < 2) {
      setFormError('Please enter your full legal name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please check and try again.');
      return;
    }
    setStep(2);
  };

  const handleStepTwoNext = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!(Number(monthlyAmount) >= 1)) {
      setFormError('Monthly investment amount must be at least $1.');
      return;
    }
    setStep(3);
  };

  const handleFinalSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!terms) {
      setFormError('Please review and accept the Terms & Risk Disclosure to continue.');
      return;
    }
    const passwordHash = await hashPassword(password);
    runProvisioningAndFinish({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      plan: selectedPlan,
      goal,
      risk,
      monthlyAmount: String(monthlyNum),
      country,
      accountType,
      twoFactorMethod,
      passwordHash,
      provider: 'email',
      createdAt: new Date().toISOString(),
    });
  };

  const signInWithGoogleProfile = (profile: { name: string; email: string }) => {
    setShowChooser(false);
    runProvisioningAndFinish({
      name: profile.name,
      email: profile.email.toLowerCase(),
      plan: selectedPlan,
      goal,
      risk,
      monthlyAmount: String(monthlyNum),
      country: country || 'United States',
      accountType,
      twoFactorMethod: 'authenticator',
      provider: 'google',
      createdAt: new Date().toISOString(),
    });
  };

  const handlePasskeyQuickStart = () => {
    const cleanEmail = email.trim() || 'private.client@invemon.com';
    const cleanName = name.trim() || 'Private Investor';
    runProvisioningAndFinish({
      name: cleanName,
      email: cleanEmail.toLowerCase(),
      plan: selectedPlan,
      goal,
      risk,
      monthlyAmount: String(monthlyNum),
      country: country || 'United States',
      accountType,
      twoFactorMethod: 'authenticator',
      provider: 'passkey',
      createdAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!clientId || !googleButtonRef.current || step !== 1) return;
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
              setGoogleError('Google sign-up could not be completed. Continue with email below.');
            }
          },
        });
        google?.accounts?.id?.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 480,
          text: 'signup_with',
        });
      })
      .catch(() => setGoogleError('Google sign-up is temporarily unavailable. Continue with email below.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, step]);

  return (
    <div className="pw-auth-shell">
      <aside className="pw-auth-rail">
        <div className="pw-rail-top">
          <button type="button" className="pw-back-link" onClick={onBack}>
            <Icon name="arrowLeft" size={16} /> Back to website
          </button>
          <span className="pw-rail-brand">
            <img src="/assets/Logo-brand-dark.png" alt="Invemon" width="126" />
          </span>
        </div>

        <div className="pw-rail-copy">
          <span className="pw-rail-kicker"><i /> Private Wealth Onboarding</span>
          <h1>Private wealth,<br /><em>quietly compounded.</em></h1>
          <p>
            Configure your risk profile, automated monthly contributions, and security controls once — Invemon handles rebalancing, dividends, and real-time analytics.
          </p>
        </div>

        <section className="pw-blueprint-card" aria-label="Live portfolio blueprint preview">
          <div className="pw-blueprint-head">
            <div>
              <span>Live Portfolio Blueprint</span>
              <strong>{risk} · {goal}</strong>
            </div>
            <span className="pw-blueprint-pill">{selectedPlan} Plan</span>
          </div>

          <div className="pw-blueprint-projection">
            <div>
              <small>Est. 10-year value</small>
              <strong className="is-gold">{fmtCurrency(projectedTenYr)}</strong>
            </div>
            <div>
              <small>Monthly DCA · Est. return</small>
              <strong>${monthlyNum.toLocaleString()}/mo · {activeBlueprint.expectedReturn}%</strong>
            </div>
          </div>

          <div className="pw-alloc-bar" aria-hidden="true">
            {activeBlueprint.allocation.map(item => (
              <span key={item.label} style={{ width: `${item.pct}%`, background: item.color }} />
            ))}
          </div>
          <div className="pw-alloc-legend">
            {activeBlueprint.allocation.map(item => (
              <span key={item.label}>
                <i style={{ background: item.color }} />
                {item.label} <b>{item.pct}%</b>
              </span>
            ))}
          </div>
        </section>

        <div className="pw-rail-footer">
          <span className="pw-rail-badge"><Icon name="shield" size={15} /> 256-bit Encryption</span>
          <span className="pw-rail-badge"><Icon name="percent" size={15} /> 4.65% Cash APY</span>
          <span className="pw-rail-badge"><Icon name="check" size={15} /> Start from $1</span>
        </div>
      </aside>

      <main className="pw-auth-stage">
        <div className="pw-auth-card">
          {provisioningIndex !== null ? (
            <div className="pw-provisioning" role="status" aria-live="polite">
              <div className="pw-spinner-gold" aria-hidden="true" />
              <span className="pw-auth-eyebrow">Opening Account</span>
              <h2>Building your wealth workspace</h2>
              <p className="pw-auth-subtitle">
                Personalizing your {risk.toLowerCase()} allocation and {selectedPlan} tier tools.
              </p>
              <div className="pw-provision-steps">
                {PROVISION_STEPS.map((label, idx) => (
                  <div key={label} className={`pw-provision-step ${idx <= provisioningIndex ? 'is-done' : ''}`}>
                    <Icon name={idx <= provisioningIndex ? 'check' : 'clock'} size={16} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="pw-auth-card-head">
                <div>
                  <span className="pw-auth-eyebrow">Step {step} of 3 · Account Onboarding</span>
                  <h2>
                    {step === 1 && 'Open your Invemon account'}
                    {step === 2 && 'Tailor your investment strategy'}
                    {step === 3 && 'Security & final review'}
                  </h2>
                  <p className="pw-auth-subtitle">
                    {step === 1 && 'Secure your credentials or continue instantly with Google.'}
                    {step === 2 && 'Choose your goal, risk profile, and monthly contribution pace.'}
                    {step === 3 && 'Confirm two-factor protection and review your private wealth profile.'}
                  </p>
                </div>
              </div>

              <div className="pw-stepper" role="tablist" aria-label="Onboarding steps">
                {[
                  { id: 1 as Step, title: 'Identity', sub: 'Credentials' },
                  { id: 2 as Step, title: 'Strategy', sub: 'Risk & Plan' },
                  { id: 3 as Step, title: 'Security', sub: '2FA & Review' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pw-step-pill ${step === item.id ? 'is-active' : step > item.id ? 'is-done' : ''}`}
                    onClick={() => {
                      if (item.id < step) {
                        setFormError('');
                        setStep(item.id);
                      }
                    }}
                  >
                    <span className="pw-step-num">
                      {step > item.id ? <Icon name="check" size={13} /> : item.id}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.sub}</small>
                    </span>
                  </button>
                ))}
              </div>

              {formError && (
                <div className="pw-error-banner" role="alert" style={{ marginBottom: 16 }}>
                  <Icon name="alert" size={17} />
                  <span>{formError}</span>
                </div>
              )}

              {step === 1 && (
                <>
                  {clientId ? (
                    <div ref={googleButtonRef} className="google-button-slot" />
                  ) : (
                    <div className="pw-sso-grid">
                      <button type="button" className="pw-sso-btn" onClick={() => setShowChooser(true)}>
                        <GoogleMark /> Google
                      </button>
                      <button type="button" className="pw-sso-btn" onClick={handlePasskeyQuickStart}>
                        <Icon name="fingerprint" size={18} /> Passkey Quick-Start
                      </button>
                    </div>
                  )}
                  {googleError && <p className="auth-error" role="alert">{googleError}</p>}

                  <div className="pw-divider"><span>OR REGISTER WITH EMAIL</span></div>

                  <form className="pw-form" onSubmit={handleStepOneNext} noValidate>
                    <div className="pw-grid-2">
                      <label className="pw-field">
                        Full legal name
                        <input
                          type="text"
                          autoComplete="name"
                          placeholder="e.g. Elena Vance"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          required
                        />
                      </label>
                      <label className="pw-field">
                        Country of residence
                        <select value={country} onChange={e => setCountry(e.target.value)}>
                          {COUNTRIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="pw-field">
                      Email address
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="you@domain.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                      />
                    </label>

                    <div className="pw-grid-2">
                      <div className="pw-field">
                        <label htmlFor="signup-password">Password</label>
                        <div className="pw-input-wrap has-right">
                          <input
                            id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Minimum 8 characters"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="pw-eye-btn"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowPassword(v => !v)}
                          >
                            <Icon name={showPassword ? 'eyeoff' : 'eye'} size={17} />
                          </button>
                        </div>
                      </div>
                      <label className="pw-field">
                        Confirm password
                        <div className="pw-input-wrap has-right">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Re-enter password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                          />
                        </div>
                      </label>
                    </div>

                    <div className="pw-strength-box" aria-live="polite">
                      <div className="pw-strength-top">
                        <span>Password strength</span>
                        <strong>{strength.label}</strong>
                      </div>
                      <div className="pw-strength-bars">
                        {[1, 2, 3, 4].map(level => (
                          <span key={level} className={strength.score >= level ? `s-${strength.score}` : ''} />
                        ))}
                      </div>
                      <div className="pw-strength-checks">
                        <span className={strength.checks.length ? 'is-ok' : ''}>
                          <Icon name="check" size={13} /> 8+ characters
                        </span>
                        <span className={strength.checks.mixedCase ? 'is-ok' : ''}>
                          <Icon name="check" size={13} /> Upper &amp; lowercase
                        </span>
                        <span className={strength.checks.number ? 'is-ok' : ''}>
                          <Icon name="check" size={13} /> Includes a number
                        </span>
                        <span className={strength.checks.symbol ? 'is-ok' : ''}>
                          <Icon name="check" size={13} /> Special character
                        </span>
                      </div>
                    </div>

                    <button type="submit" className="pw-btn-primary">
                      Continue to Investment Strategy <Icon name="arrow" size={17} />
                    </button>
                  </form>
                </>
              )}

              {step === 2 && (
                <form className="pw-form" onSubmit={handleStepTwoNext}>
                  <div>
                    <span className="pw-field" style={{ marginBottom: 8 }}>Primary investment objective</span>
                    <div className="pw-choice-grid">
                      {GOALS.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          className={`pw-choice-card ${goal === item.id ? 'is-selected' : ''}`}
                          onClick={() => setGoal(item.id)}
                        >
                          <strong>{item.id}</strong>
                          <small>{item.subtitle}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="pw-field" style={{ marginBottom: 8 }}>Risk tolerance</span>
                    <div className="pw-choice-grid">
                      {RISK_BLUEPRINTS.map(bp => (
                        <button
                          key={bp.id}
                          type="button"
                          className={`pw-choice-card ${risk === bp.id ? 'is-selected' : ''}`}
                          onClick={() => setRisk(bp.id)}
                        >
                          <div className="pw-choice-card-top">
                            <strong>{bp.id}</strong>
                            <span className="pw-choice-badge">{bp.expectedReturn}% est.</span>
                          </div>
                          <small>{bp.tagline}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pw-slider-panel">
                    <div className="pw-slider-head">
                      <span>Monthly auto-invest pace</span>
                      <strong>${monthlyNum.toLocaleString()}/month</strong>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="5000"
                      step="25"
                      value={monthlyNum}
                      onChange={e => setMonthlyAmount(e.target.value)}
                      aria-label="Monthly auto-invest amount"
                    />
                    <div className="pw-slider-presets">
                      {[100, 250, 500, 1000, 2500].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          className={monthlyNum === preset ? 'is-active' : ''}
                          onClick={() => setMonthlyAmount(String(preset))}
                        >
                          ${preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="pw-field" style={{ marginBottom: 8 }}>Membership plan</span>
                    <div className="pw-choice-grid">
                      {PLAN_TIERS.map(tier => (
                        <button
                          key={tier.id}
                          type="button"
                          className={`pw-choice-card ${selectedPlan === tier.id ? 'is-selected' : ''}`}
                          onClick={() => onPlanChange(tier.id)}
                        >
                          <div className="pw-choice-card-top">
                            <strong>{tier.id}</strong>
                            <span className="pw-choice-badge">{tier.price}{tier.period}</span>
                          </div>
                          <small>{tier.highlight}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pw-actions-row">
                    <button type="button" className="pw-btn-secondary" onClick={() => setStep(1)}>
                      <Icon name="arrowLeft" size={16} /> Back
                    </button>
                    <button type="submit" className="pw-btn-primary">
                      Continue to Security &amp; Review <Icon name="arrow" size={17} />
                    </button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form className="pw-form" onSubmit={handleFinalSubmit}>
                  <div>
                    <span className="pw-field" style={{ marginBottom: 8 }}>Account structure</span>
                    <div className="pw-mode-tabs" style={{ marginBottom: 0 }}>
                      {(['Individual', 'Joint', 'Retirement'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          className={accountType === type ? 'is-active' : ''}
                          onClick={() => setAccountType(type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="pw-field" style={{ marginBottom: 8 }}>Two-factor authentication (2FA)</span>
                    <div className="pw-choice-grid">
                      {[
                        { id: 'authenticator' as const, title: 'Authenticator App', desc: 'TOTP verification on every new login', badge: 'Recommended' },
                        { id: 'email' as const, title: 'Email 6-Digit Code', desc: 'Instant one-time code to your inbox', badge: 'Fast' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`pw-choice-card ${twoFactorMethod === opt.id ? 'is-selected' : ''}`}
                          onClick={() => setTwoFactorMethod(opt.id)}
                        >
                          <div className="pw-choice-card-top">
                            <strong>{opt.title}</strong>
                            <span className="pw-choice-badge">{opt.badge}</span>
                          </div>
                          <small>{opt.desc}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pw-review-box">
                    <div><span>Client</span><strong>{name}</strong></div>
                    <div><span>Email</span><strong>{email}</strong></div>
                    <div><span>Plan &amp; Structure</span><strong>{selectedPlan} · {accountType}</strong></div>
                    <div><span>Strategy</span><strong>{risk} · {goal}</strong></div>
                    <div><span>Monthly DCA</span><strong>${monthlyNum.toLocaleString()}/month</strong></div>
                    <div><span>Jurisdiction</span><strong>{country}</strong></div>
                  </div>

                  <label className="terms-check" style={{ margin: '4px 0' }}>
                    <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
                    <span>
                      I agree to the Invemon Client Agreement and acknowledge that all investing involves risk, including possible loss of principal.
                    </span>
                  </label>

                  <div className="pw-actions-row">
                    <button type="button" className="pw-btn-secondary" onClick={() => setStep(2)}>
                      <Icon name="arrowLeft" size={16} /> Back
                    </button>
                    <button type="submit" className="pw-btn-primary pw-btn-gold">
                      Complete &amp; Open Portfolio <Icon name="arrow" size={17} />
                    </button>
                  </div>
                </form>
              )}

              <p className="pw-auth-footer-switch">
                Already an Invemon client?{' '}
                <button type="button" onClick={onSignIn}>Sign in to Wealth Portal</button>
              </p>
            </>
          )}
        </div>
      </main>

      {showChooser && (
        <div className="chooser-backdrop" onClick={() => setShowChooser(false)}>
          <div className="chooser" role="dialog" aria-modal="true" aria-labelledby="chooser-title" onClick={event => event.stopPropagation()}>
            <div className="chooser-head">
              <GoogleMark />
              <h3 id="chooser-title">Continue with Google</h3>
              <p>Select a Google account for <strong>Invemon Wealth</strong></p>
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
              style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ece8de', display: 'grid', gap: 10 }}
              onSubmit={e => {
                e.preventDefault();
                if (!customGoogleEmail.includes('@')) return;
                signInWithGoogleProfile({
                  name: customGoogleEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
                  email: customGoogleEmail.trim(),
                });
              }}
            >
              <label className="pw-field">
                Or use another Google email
                <input
                  type="email"
                  placeholder="yourname@gmail.com"
                  value={customGoogleEmail}
                  onChange={e => setCustomGoogleEmail(e.target.value)}
                />
              </label>
              {customGoogleEmail.trim() && (
                <button type="submit" className="pw-btn-primary" style={{ minHeight: 42 }}>
                  Continue with {customGoogleEmail.trim()}
                </button>
              )}
            </form>
            <button type="button" className="chooser-cancel" onClick={() => setShowChooser(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
