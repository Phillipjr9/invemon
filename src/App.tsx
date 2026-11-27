import { useEffect, useRef, useState } from 'react';
import Icon from './components/Icon';
import Counter from './components/Counter';
import Dialogs, { type DialogState, type InvestmentAccount } from './components/Dialogs';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import { MarketTicker, InvestmentCalculator } from './components/HomeExtras';

const asset = (name: string) => `/assets/${name}`;
const phone = asset('Phone-Mockup-2-B2GNQEM.png');
const tradingPhone = asset('Phone-Mockup-B2GNQEM.png');

const benefits = [
  { title: 'AI-Powered Insights', text: 'Get real-time market analysis for your goals smart decisions.' },
  { title: 'Start with Just $1', text: 'Start small and build your future. Invest from just $1, at your own pace, with no large minimum deposit.' },
  { title: 'Zero Hidden Fees', text: 'Know exactly what you pay. Clear, straightforward pricing means more of your money stays invested.' },
  { title: 'Bank-Grade Security', text: 'Your peace of mind comes first. Advanced encryption and secure verification help protect your account.' },
];

const plans = [
  { name: 'Free', price: '0', note: 'Free 1 month', icon: 'coffee', features: ['Start investing with as little as $1', 'Access to basic portfolios', 'Real-time market data', 'Bank-grade security'] },
  { name: 'Pro', price: '9.99', note: '*Paid annually at $280/year', icon: 'home', features: ['Everything in Free Plan', 'Advanced portfolio analytics', 'AI-powered investment recommendations', 'Priority customer support'] },
  { name: 'Premium', price: '19.99', note: '*Paid annually at $380/year', icon: 'buildings', features: ['Everything in Pro Plan', 'Unlimited auto-invest strategies', 'Exclusive expert insights & reports', 'Early access to new features'] },
  { name: 'Elite', price: '24.99', note: '*Paid annually at $510/year', icon: 'tower', features: ['Everything in Pro Plan', 'Dedicated financial advisor', 'Early access to new features', 'VIP community for investors'] },
];

const reviews = [
  { name: 'Marina T', role: 'Beginner Investor', image: '4-people-having-a-v-3628WWS.png', quote: 'I started with just $5 and within months I felt confident managing my portfolio. The AI suggestions are spot on!' },
  { name: 'Daniel R.', role: 'Crypto Enthusiast', image: '2-people-having-a-v-3628WWS.png', quote: 'Finally, one app that lets me track stocks, ETFs, and crypto in one place. Super convenient and secure.' },
  { name: 'Lina K.', role: 'Working Professional', image: '5-people-having-a-v-3628WWS.png', quote: 'Auto-invest is a lifesaver. I set it once and my investments keep growing while I focus on my career.' },
];

function Chips() {
  return <div className="hero-chips"><span><i><Icon name="money" size={18} /></i>Financial Freedom</span><span><i><Icon name="coins" size={18} /></i>Investment</span></div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="section-label">{children}</span>;
}

function PlayButton({ onClick, label, dark = false }: { onClick: () => void; label?: string; dark?: boolean }) {
  return <button className={`play-button ${dark ? 'play-dark' : ''}`} onClick={onClick} aria-label={label || 'Play video'}><span className="play-circle"><Icon name="play" size={28} /></span>{label && <span className="play-caption">{label}</span>}</button>;
}

function SignupSection({ account, onGoSignup, onGoLogin, onOpenDashboard }: { account: InvestmentAccount | null; onGoSignup: () => void; onGoLogin: () => void; onOpenDashboard: () => void }) {
  return (
    <section className="signup section" id="signup" aria-labelledby="signup-title">
      <div className="page-width signup-banner reveal">
        <div className="signup-banner-copy">
          <h2 id="signup-title">Start investing in minutes.</h2>
          <p>Choose your plan, calibrate your risk profile, set your monthly contribution, and let automated investing compound your wealth.</p>
          <ul className="signup-points signup-points-grid">
            <li><Icon name="check" size={20} />Start with as little as $1</li>
            <li><Icon name="check" size={20} />AI-powered portfolios and insights</li>
            <li><Icon name="check" size={20} />Bank-grade security and 2FA verification</li>
            <li><Icon name="check" size={20} />Stocks, ETFs, crypto, and 4.65% cash APY</li>
          </ul>
          <div className="signup-banner-actions">
            {account ? (
              <button className="button button-lime" onClick={onOpenDashboard}>
                Open Wealth Dashboard <Icon name="arrow" size={18} />
              </button>
            ) : (
              <>
                <button className="button button-lime" onClick={onGoSignup}>
                  Get Started <Icon name="arrow" size={18} />
                </button>
                <button className="button button-light" onClick={onGoLogin}>
                  Client Sign In
                </button>
              </>
            )}
          </div>
          <p className="risk-note">
            Investing involves risk, including possible loss of principal. Past performance does not guarantee future results. Review your risk profile before investing.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState('home');
  const [openBenefit, setOpenBenefit] = useState<number | null>(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewsPaused, setReviewsPaused] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState('');
  const [account, setAccount] = useState<InvestmentAccount | null>(() => {
    try { return JSON.parse(localStorage.getItem('invemon-account') || 'null'); } catch { return null; }
  });
  const [selectedPlan, setSelectedPlan] = useState('Free');
  const [view, setView] = useState<'home' | 'signup' | 'login' | 'dashboard'>('home');
  const headerRef = useRef<HTMLElement>(null);

  const openDialog = (next: DialogState) => { setDialog(next); setMenuOpen(false); setDropdown(null); };
  const goSignup = (plan = 'Free') => { setSelectedPlan(plan); setMenuOpen(false); setDropdown(null); setView('signup'); };
  const goLogin = () => { setMenuOpen(false); setDropdown(null); setView('login'); };
  const goHome = () => { setView('home'); setMenuOpen(false); setDropdown(null); };
  const start = goSignup;
  const navigate = (name: string) => { setActiveNav(name); setMenuOpen(false); setDropdown(null); };

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [view]);

  useEffect(() => {
    if (view !== 'home') return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) { setDropdown(null); setMenuOpen(false); }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setDropdown(null); setMenuOpen(false); }
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => { document.removeEventListener('pointerdown', handleOutside); document.removeEventListener('keydown', handleEscape); };
  }, []);

  useEffect(() => {
    if (reviewsPaused || dialog || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => setReviewIndex(index => (index + 1) % reviews.length), 7000);
    return () => clearInterval(interval);
  }, [reviewsPaused, dialog]);

  const subscribe = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const emails: string[] = JSON.parse(localStorage.getItem('invemon-newsletter') || '[]');
      localStorage.setItem('invemon-newsletter', JSON.stringify([...new Set([...emails, newsletterEmail.trim().toLowerCase()])]));
      setNewsletterStatus("You're subscribed.");
    } catch { setNewsletterStatus('Thank you for subscribing.'); }
    setNewsletterEmail('');
  };

  const goDashboard = () => { setMenuOpen(false); setDropdown(null); setView('dashboard'); };

  if (view === 'signup') return <><SignupPage account={account} onAccount={setAccount} selectedPlan={selectedPlan} onPlanChange={setSelectedPlan} onBack={goHome} onComplete={() => setView('dashboard')} onSignIn={goLogin} /><Dialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} account={account} onAccount={setAccount} onGoSignup={() => setView('signup')} onGoDashboard={() => setView('dashboard')} /></>;
  if (view === 'login') return <><LoginPage account={account} onAccount={setAccount} onBack={goHome} onComplete={() => setView('dashboard')} onGoSignup={() => goSignup(selectedPlan)} /><Dialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} account={account} onAccount={setAccount} onGoSignup={() => setView('signup')} onGoDashboard={() => setView('dashboard')} /></>;
  if (view === 'dashboard') return <><DashboardPage account={account} onAccount={setAccount} onBack={goHome} onSignUp={() => setView('signup')} onOpenSupport={() => setDialog({ type: 'support' })} onOpenCareers={() => setDialog({ type: 'careers' })} onOpenProfile={() => setDialog({ type: 'account' })} onSignOut={() => { try { localStorage.removeItem('invemon-account'); } catch { /* No saved profile to clear. */ } setAccount(null); setView('home'); }} /><Dialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} account={account} onAccount={setAccount} onGoSignup={() => setView('signup')} onGoDashboard={() => setView('dashboard')} /></>;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header" ref={headerRef} id="home">
        <a className="brand" href="#home" aria-label="Invemon home" onClick={() => navigate('home')}><img src={asset('Logo-brand-light.png')} alt="Invemon" width="150" height="33" /></a>
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation" id="main-navigation">
          <a className={activeNav === 'home' ? 'active' : ''} href="#home" onClick={() => navigate('home')}>Home</a>
          <a className={activeNav === 'about' ? 'active' : ''} href="#about" onClick={() => navigate('about')}>About us</a>
          <a className={activeNav === 'features' ? 'active' : ''} href="#features" onClick={() => navigate('features')}>Feature</a>
          <div className="nav-dropdown">
            <button aria-expanded={dropdown === 'page'} aria-controls="page-menu" onClick={() => setDropdown(dropdown === 'page' ? null : 'page')}>Page <Icon name={dropdown === 'page' ? 'minus' : 'plus'} size={16} /></button>
            {dropdown === 'page' && <div className="dropdown-panel" id="page-menu"><a href="#pricing" onClick={() => navigate('pricing')}>Pricing Plans</a><a href="#product" onClick={() => navigate('product')}>Our Product</a><a href="#reviews" onClick={() => navigate('reviews')}>Investor Reviews</a><a href="#how-it-works" onClick={() => navigate('how-it-works')}>How It Works</a></div>}
          </div>
          <div className="nav-dropdown">
            <button aria-expanded={dropdown === 'system'} aria-controls="system-menu" onClick={() => setDropdown(dropdown === 'system' ? null : 'system')}>System <Icon name={dropdown === 'system' ? 'minus' : 'plus'} size={16} /></button>
            {dropdown === 'system' && <div className="dropdown-panel" id="system-menu"><button onClick={goDashboard}>Wealth Dashboard</button><button onClick={() => openDialog({ type: 'support' })}>Help Center</button><a href="#why-us" onClick={() => navigate('why-us')}>Why Invemon</a><a href="#contact" onClick={() => navigate('contact')}>Contact us</a></div>}
          </div>
          <button className="nav-download" onClick={goDashboard}>Dashboard</button>
          <div className="mobile-nav-actions"><button className="button button-lime" onClick={() => (account ? goDashboard() : goSignup('Free'))}>{account ? 'Dashboard' : 'Sign Up'}</button><button className="button button-light" onClick={() => (account ? openDialog({ type: 'account' }) : goLogin())}>{account ? 'My account' : 'Sign in'}</button></div>
        </nav>
        <div className="header-actions"><button className="button button-lime" onClick={() => (account ? goDashboard() : goSignup('Free'))}>{account ? 'Dashboard' : 'Sign Up'}</button><button className="button button-light" onClick={() => (account ? openDialog({ type: 'account' }) : goLogin())}>{account ? 'My account' : 'Sign in'}</button></div>
        <button className="mobile-menu-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={24} /></button>
      </header>

      <main id="main-content">
        <section className="hero" aria-label="Invemon investment platform">
          <h1 className="hero-word">INVESTMENT</h1>
          <div className="hero-stage">
            <div className="hero-inner page-width">
              <div className="hero-visual">
                <div className="hero-stats"><Counter label="People joined" value={100} /><Counter label="Assets Managed" prefix="$" value={250} suffix="B" /><Counter label="App Rating" value={4.5} /></div>
                <img className="hero-phone" src={phone} alt="Invemon mobile investment app showing a portfolio and real-time market statistics" fetchPriority="high" width="482" height="818" />
              </div>
              <div className="hero-copy">
                <Chips />
                <h2>Auto-Invest, Zero Stress Strategy</h2>
                <p>Set it and forget it. Our automated investing feature grows your wealth while you focus on life.</p>
<div className="button-group"><button className="button button-lime" onClick={() => goSignup('Free')}>Sign Up</button><a className="button button-blue" href="#pricing">View Pricing</a></div>
              </div>
            </div>
          </div>
        </section>
        <MarketTicker />

        <section className="partners dark-section">
          <div className="partners-inner page-width">
            <div className="partners-copy"><h2>Trusted by thousands companies.</h2><div className="logo-window" aria-label="Trusted partners: Oasis, Logoipsum, Stratifi, Virex, and Altura"><div className="logo-track">{[...['iOasis.png', 'Logo.png', 'Stratifi.png', 'Vector.png', 'Altura.png'], ...['iOasis.png', 'Logo.png', 'Stratifi.png', 'Vector.png', 'Altura.png']].map((logo, index) => <img key={`${logo}-${index}`} src={asset(logo)} alt="" loading="lazy" />)}</div></div></div>
            <div className="partners-image" role="img" aria-label="Financial market trading chart" />
          </div>
        </section>

        <section className="features section dark-section" id="features">
          <div className="page-width">
            <div className="section-heading feature-heading reveal"><SectionLabel>Features</SectionLabel><h2>All-in-One Platform for Smarter Investing</h2><a className="button button-lime heading-action" href="#product">See more</a></div>
            <div className="feature-grid reveal">
              <article className="feature-main">
                <div className="feature-main-content"><div className="feature-tools">{['target', 'sprout', 'gem', 'chart'].map(icon => <span key={icon}><Icon name={icon} size={32} /></span>)}</div><span className="mini-label"><i><Icon name="code" size={17} /></i>Automatic</span><h3>AI-Powered Investment Insights</h3><p>Get personalized recommendations based on your goals, risk profile, and market trends - updated in real time.</p></div>
                <div className="feature-main-phone"><img src={tradingPhone} alt="AI-powered investment insights in the Invemon app" loading="lazy" /></div>
              </article>
              <div className="feature-secondary">
                <article className="feature-market"><img src={asset('currency-YCG8AHH.jpg')} alt="Investor monitoring live markets on a laptop" loading="lazy" /><div><span className="mini-label green"><i><Icon name="clock" size={17} /></i>Updated</span><h3>Real-Time Market Data</h3><p>Stay ahead with instant access to live prices, charts, and financial news from trusted sources.</p></div></article>
                <article className="feature-assets"><div><span className="mini-label green"><i><Icon name="coins" size={17} /></i>Asset</span><h3>Multi-Asset Support</h3><p>Invest in stocks, ETFs, crypto, and commodities all in one app, with seamless portfolio tracking.</p></div><img src={phone} alt="A single app for every investment" loading="lazy" /></article>
              </div>
            </div>
          </div>
        </section>

        <section className="about section" id="about">
          <div className="about-grid page-width">
            <div className="about-aside reveal"><SectionLabel>About us</SectionLabel><img src={asset('wins-FHYGRXJ.jpg')} alt="The finance and technology team behind Invemon" loading="lazy" /></div>
            <div className="about-content reveal"><p className="about-intro">Founded by a team of finance experts and tech innovators, our mission is to break down barriers to investing. We combine advanced AI technology, global market access, and user-first design to help you make smarter financial moves.</p><div className="about-middle"><div><h2>Empowering Everyone to Grow Wealth</h2><a href="#why-us" className="button button-lime">Learn More</a></div><PlayButton dark label="Watch video" onClick={() => openDialog({ type: 'video' })} /></div><div className="about-stats"><Counter label="People joined" value={100} /><Counter label="Assets Managed" prefix="$" value={250} suffix="B" /><Counter label="App Rating" value={4.5} /><Counter label="Countries Served" value={50} /></div></div>
          </div>
        </section>

        <section className="why section" id="why-us">
          <div className="page-width"><div className="section-heading why-heading reveal"><SectionLabel>Why choose us</SectionLabel><h2>We use technology and expert guidance to maximize your money.</h2><p>Investing is effortless with technology, security, and guidance.</p></div>
            <div className="why-grid reveal"><div className="benefits">{benefits.map((benefit, index) => <div className={`benefit ${openBenefit === index ? 'is-open' : ''}`} key={benefit.title}><h3><button aria-expanded={openBenefit === index} aria-controls={`benefit-${index}`} onClick={() => setOpenBenefit(openBenefit === index ? null : index)}><span>0{index + 1}. {benefit.title}</span><Icon name={openBenefit === index ? 'minus' : 'plus'} size={30} /></button></h3><div className="benefit-answer" id={`benefit-${index}`} inert={openBenefit !== index}><div><p>{benefit.text}</p></div></div></div>)}</div><img className="why-main-image" src={asset('part-of-9ES8348.jpg')} alt="Market experts analyzing investment performance" loading="lazy" /><div className="why-side"><img src={asset('moder-HL9BTHH.jpg')} alt="Investment advisors working together" loading="lazy" /><div className="managed-assets"><Counter label="Assets Managed" prefix="$" value={250} suffix="B" /><button className="outline-button" onClick={() => start()}>Start Investing now</button></div></div></div>
          </div>
        </section>

        <section className="how section" id="how-it-works">
          <div className="page-width"><div className="section-heading reveal"><SectionLabel>How It Work</SectionLabel><h2>From Imagination to Monetization in Minutes</h2><p>Investing is effortless with technology, security, and guidance.</p></div><div className="steps-grid reveal">{[{ title: 'Sign Up & Verify', text: 'Create your account in minutes and complete secure verification.' }, { title: 'Choose Your Portfolio', text: 'Choose AI portfolios or create your investment plan.' }, { title: 'Grow & Track', text: 'Track investments with real-time insights.' }].map((step, index) => <article className="step" key={step.title}><span className="step-number">#0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p><button className="button button-lime" onClick={() => start()}>Get Started</button></article>)}<div className="tutorial-tile"><PlayButton label="Watch Tutorial" onClick={() => openDialog({ type: 'video' })} /></div></div></div>
        </section>

        <section className="download-banner dark-section" id="platform">
          <div className="download-inner page-width"><div className="download-copy reveal"><Chips /><h2>Investors grow wealth on our secure platform.</h2><div className="button-group"><button className="button button-lime" onClick={() => goSignup('Free')}>Sign Up</button><a className="button button-blue" href="#pricing">View Pricing</a></div></div><img className="download-phone" src={tradingPhone} alt="Invemon stock trading and investment app screens" loading="lazy" /></div>
        </section>

        <section className="product section" id="product">
          <div className="page-width"><div className="product-heading reveal"><SectionLabel>Our Product</SectionLabel><h2>Your All-in-One Investment Platform</h2><p>Everything you need to start, manage, and grow your wealth - in one simple app.</p></div><div className="product-grid reveal"><div className="product-column"><article className="product-feature"><span className="product-icon"><Icon name="wallet" size={32} /></span><h3>Personalized Portfolios</h3><p>Build investment plans tailored to your goals and risk level.</p></article><article className="product-feature"><span className="product-icon"><Icon name="folders" size={32} /></span><h3>Multi-Asset Access</h3><p>Trade stocks, ETFs, crypto, mutual funds, and bonds from one dashboard.</p></article></div><div className="product-phone"><img src={phone} alt="Your complete investment portfolio, always at hand" loading="lazy" /></div><div className="product-column"><article className="product-feature"><span className="product-icon"><Icon name="phone" size={32} /></span><h3>Real-Time Analytics</h3><p>Track your portfolio performance with live data and smart alerts.</p></article><article className="product-feature"><span className="product-icon"><Icon name="sprout" size={32} /></span><h3>Automated Investing</h3><p>Set recurring investments and let your money work for you 24/7.</p></article></div></div></div>
        </section>

        <section className="pricing section" id="pricing">
          <div className="page-width"><div className="section-heading reveal"><SectionLabel>Subscribe Plans</SectionLabel><h2>Flexible Pricing for Every Kind of Work</h2><p>From beginners to pros - pick the plan that fits your journey.</p></div><div className="pricing-grid reveal">{plans.map(plan => <article className={`price-plan ${plan.name === 'Pro' ? 'plan-featured' : ''}`} key={plan.name}><h3><span className="plan-icon"><Icon name={plan.icon} size={25} /></span>{plan.name} Plan</h3><div className="plan-price"><strong>${plan.price}</strong><span>/month*</span></div><p className="plan-note">{plan.note}</p><button className="button button-lime" onClick={() => start(plan.name)}>Get Started</button><div className="plan-includes"><h4>What included?</h4><ul>{plan.features.map(feature => <li key={feature}><Icon name="plus" size={20} /><span>{feature}</span></li>)}</ul></div></article>)}</div></div>
        </section>

        <InvestmentCalculator onSignUp={() => goSignup(selectedPlan)} />
        <SignupSection account={account} onGoSignup={() => goSignup(selectedPlan)} onGoLogin={goLogin} onOpenDashboard={goDashboard} />
        <section className="testimonials section" id="reviews">
          <div className="page-width"><div className="section-heading testimonial-heading reveal"><SectionLabel>What Our Investors Say</SectionLabel><h2>Real stories from real people growing their wealth with us.</h2><button className="button button-lime heading-action" onClick={() => setReviewIndex(index => (index + 1) % reviews.length)} aria-label="See more investor reviews">See more</button></div><div className="testimonials-grid reveal"><div className="stories-image"><PlayButton onClick={() => openDialog({ type: 'video' })} label="Watch investor stories" /><span className="stories-label">Real stories</span><span className="stories-flower"><Icon name="flower" size={28} /></span></div><div className="testimonial-carousel" onMouseEnter={() => setReviewsPaused(true)} onMouseLeave={() => setReviewsPaused(false)} onFocus={() => setReviewsPaused(true)} onBlur={() => setReviewsPaused(false)} aria-live="polite">{[reviews[reviewIndex], reviews[(reviewIndex + 1) % reviews.length]].map(review => <article className="review" key={review.name}><div className="review-stars" aria-label="5 out of 5 stars">{Array.from({ length: 5 }, (_, index) => <Icon key={index} name="star" size={17} />)}</div><blockquote>&quot;{review.quote}&quot;</blockquote><div className="review-person"><img src={asset(review.image)} alt={review.name} loading="lazy" /><div><span>{review.name}</span><small>{review.role}</small></div><span className="quote-mark" aria-hidden="true">99</span></div></article>)}</div></div></div>
        </section>
      </main>

      <footer className="site-footer dark-section" id="contact">
        <div className="page-width"><section className="footer-cta"><div className="footer-phones"><img src={tradingPhone} alt="Start building your future with the Invemon app" loading="lazy" /></div><div className="footer-cta-copy reveal"><h2>Ready to Grow Your Wealth?</h2><p>Join 100K+ investors already building their future with our secure, all-in-one platform.</p><div className="button-group"><button className="button button-lime" onClick={() => goSignup('Free')}>Sign Up</button><button className="button button-navy" onClick={goLogin}>Client Sign In</button></div></div></section>
          <div className="footer-main"><div className="footer-brand"><a href="#home" aria-label="Invemon home"><img src={asset('Logo-brand-dark.png')} alt="Invemon" width="250" /></a><p>An all-in-one investment platform designed to help you grow your wealth with AI-powered insights, real-time data, and bank-grade security.</p></div><div className="footer-links"><div><h3>Quick Link</h3><a href="#home">Home</a><button onClick={goDashboard}>Wealth Dashboard</button><a href="#pricing">Pricing Plans</a><button onClick={() => goSignup('Free')}>Sign Up</button><button onClick={goLogin}>Sign In</button><a href="#features">Features</a></div><div><h3>Support</h3><a href="#contact-details">Contact us</a><button onClick={() => openDialog({ type: 'support' })}>Help Center</button><a href="#how-it-works">How It Works</a><button onClick={() => openDialog({ type: 'support' })}>FAQ's</button></div><div><h3>Career</h3><button onClick={() => openDialog({ type: 'careers' })}>Jobs</button><button onClick={() => openDialog({ type: 'careers' })}>Hiring</button></div></div></div>
          <div className="footer-bottom-grid"><div className="newsletter"><h3>Newsletter Signup</h3><form onSubmit={subscribe}><label className="sr-only" htmlFor="newsletter-email">Your email address</label><input id="newsletter-email" type="email" placeholder="Enter Your Email" value={newsletterEmail} onChange={event => setNewsletterEmail(event.target.value)} autoComplete="email" required /><button className="button button-lime" type="submit">Notify Me</button></form><p className="newsletter-status" role="status">{newsletterStatus}</p></div><div className="footer-details" id="contact-details"><div><h3>Address</h3><p>Sudirman Street 302, Metro,<br />Lampung Indonesia.</p></div><div><h3>Contact</h3><a href="tel:+123456789"><Icon name="call" size={22} />+123 456 789</a><a href="mailto:support@gravix.com"><Icon name="mail" size={22} />support@gravix.com</a></div></div></div>
          <div className="footer-copyright"><p>Copyright &copy; 2025 Invemon</p><p>Powered by Samtiv Studio</p><div className="footer-socials"><a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook">f</a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="5" /><circle cx="10" cy="10" r="4" /><circle cx="15" cy="5" r=".7" fill="currentColor" /></svg></a><a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn">in</a><a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube"><Icon name="play" size={16} /></a></div></div>
        </div>
      </footer>
      <Dialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} account={account} onAccount={setAccount} onGoSignup={() => setView('signup')} onGoDashboard={() => setView('dashboard')} />
    </>
  );
}
