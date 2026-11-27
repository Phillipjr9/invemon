import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import type { InvestmentAccount } from './Dialogs';

export type DashboardSection =
  | 'overview'
  | 'portfolio'
  | 'markets'
  | 'crypto'
  | 'yield'
  | 'autoinvest'
  | 'goals'
  | 'activity'
  | 'insights'
  | 'settings';

export type HeaderNotice = {
  id: string;
  icon: string;
  level: 'info' | 'warn';
  title: string;
  body: string;
  section: DashboardSection;
  action: string;
  task?: 'deposit';
};

export type CommandItem = {
  id: string;
  group: 'Actions' | 'Sections' | 'Assets';
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  onSelect: () => void;
};

type HeaderProps = {
  account: InvestmentAccount;
  section: DashboardSection;
  hideBalances: boolean;
  unreadCount: number;
  notifications: HeaderNotice[];
  readNotificationIds: string[];
  onNavigate: (section: DashboardSection) => void;
  onBackToWebsite: () => void;
  onOpenDeposit: () => void;
  onOpenTrade: () => void;
  onTogglePrivacy: () => void;
  onOpenCommand: () => void;
  onSelectNotification: (notice: HeaderNotice) => void;
  onMarkAllRead: () => void;
  onOpenSupport?: () => void;
  onOpenProfile?: () => void;
  onSignOut: () => void;
};

const TOP_LINKS: { id: DashboardSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'markets', label: 'Markets' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'yield', label: 'Yield & Income' },
  { id: 'goals', label: 'Goals' },
];

export function DashboardHeader({
  account,
  section,
  hideBalances,
  unreadCount,
  notifications,
  readNotificationIds,
  onNavigate,
  onBackToWebsite,
  onOpenDeposit,
  onOpenTrade,
  onTogglePrivacy,
  onOpenCommand,
  onSelectNotification,
  onMarkAllRead,
  onOpenSupport,
  onOpenProfile,
  onSignOut,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const firstName = account.name.split(' ')[0] || 'Investor';
  const initial = firstName.slice(0, 1).toUpperCase();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setNotifOpen(false);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNotifOpen(false);
        setUserMenuOpen(false);
        onOpenCommand();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onOpenCommand]);

  const selectLink = (next: DashboardSection) => {
    onNavigate(next);
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setUserMenuOpen(false);
  };

  return (
    <header className="db-top-header" ref={headerRef}>
      <div className="db-top-header-inner">
        <div className="db-top-brand-group">
          <button type="button" className="db-top-brand" onClick={onBackToWebsite} aria-label="Invemon website home">
            <img src="/assets/Logo-brand-light.png" alt="Invemon" width="138" height="30" />
          </button>
          <span className="db-top-divider" aria-hidden="true" />
          <span className="db-top-portal-pill">
            <i className="db-live-pulse" aria-hidden="true" />
            Wealth Portal
          </span>
        </div>

        <nav className={`db-top-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Primary platform navigation">
          <button type="button" className="db-top-home-link" onClick={onBackToWebsite}>
            <Icon name="home" size={15} /> Website Home
          </button>
          {TOP_LINKS.map(link => (
            <button
              type="button"
              key={link.id}
              className={section === link.id ? 'is-active' : ''}
              aria-current={section === link.id ? 'page' : undefined}
              onClick={() => selectLink(link.id)}
            >
              {link.label}
            </button>
          ))}
          {onOpenSupport && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSupport();
              }}
            >
              Support
            </button>
          )}
          <div className="db-top-mobile-actions">
            <button type="button" className="db-btn lime" onClick={() => { setMobileMenuOpen(false); onOpenDeposit(); }}>
              <Icon name="plus" size={15} /> Deposit
            </button>
            <button type="button" className="db-btn" onClick={() => { setMobileMenuOpen(false); onOpenTrade(); }}>
              <Icon name="trend" size={15} /> Trade
            </button>
          </div>
        </nav>

        <div className="db-top-actions">
          <button
            type="button"
            className="db-cmd-trigger"
            onClick={onOpenCommand}
            aria-label="Search holdings, markets, and quick commands"
          >
            <Icon name="search" size={16} />
            <span>Search or jump...</span>
            <kbd>⌘K</kbd>
          </button>

          <button
            type="button"
            className="db-iconbtn"
            aria-label={hideBalances ? 'Show account values' : 'Hide account values'}
            title={hideBalances ? 'Show account values' : 'Hide account values'}
            onClick={onTogglePrivacy}
          >
            <Icon name={hideBalances ? 'eye' : 'eyeoff'} size={17} />
          </button>

          <div className="db-notification-anchor">
            <button
              type="button"
              className="db-iconbtn"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={notifOpen}
              aria-controls="db-notifications"
              onClick={() => {
                setNotifOpen(value => !value);
                setUserMenuOpen(false);
              }}
            >
              <Icon name="bell" size={18} />
              {unreadCount > 0 && <span className="db-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notifOpen && (
              <section className="db-notification-panel" id="db-notifications" aria-label="Investment notifications">
                <header>
                  <div>
                    <strong>For your attention</strong>
                    <small>{unreadCount ? `${unreadCount} new update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}</small>
                  </div>
                  <button type="button" onClick={onMarkAllRead} disabled={!unreadCount}>Mark all read</button>
                </header>
                {notifications.length ? (
                  <div className="db-notification-list">
                    {notifications.map(item => {
                      const isRead = readNotificationIds.includes(item.id);
                      return (
                        <article key={item.id} className={isRead ? 'is-read' : ''}>
                          <span className={`db-notification-icon ${item.level}`}><Icon name={item.icon} size={18} /></span>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.body}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setNotifOpen(false);
                                onSelectNotification(item);
                              }}
                            >
                              {item.action} <Icon name="arrow" size={14} />
                            </button>
                          </div>
                          {!isRead && <i className="db-unread-dot" />}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="db-notification-empty">
                    <Icon name="check" size={21} />
                    <strong>No updates yet</strong>
                    <p>Portfolio reminders and review items will appear here.</p>
                  </div>
                )}
                <footer>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigate('settings');
                    }}
                  >
                    Manage notification preferences
                  </button>
                </footer>
              </section>
            )}
          </div>

          <button type="button" className="db-header-cta" onClick={onOpenDeposit}>
            <Icon name="plus" size={16} />
            <span>Deposit</span>
          </button>

          <div className="db-user-anchor">
            <button
              type="button"
              className="db-user-pill"
              aria-expanded={userMenuOpen}
              aria-label="Account menu"
              onClick={() => {
                setUserMenuOpen(value => !value);
                setNotifOpen(false);
              }}
            >
              <span className="db-avatar">{initial}</span>
              <span className="db-user-meta">
                <strong>{firstName}</strong>
                <small>{account.plan} Plan</small>
              </span>
              <Icon name="chevron" size={14} />
            </button>

            {userMenuOpen && (
              <div className="db-user-dropdown" role="menu">
                <div className="db-user-dropdown-head">
                  <strong>{account.name}</strong>
                  <small>{account.email}</small>
                  <span className="db-tag info">{account.risk || 'Balanced'} risk · {account.plan} Plan</span>
                </div>
                {onOpenProfile && (
                  <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); onOpenProfile(); }}>
                    <Icon name="user" size={16} /> Investor Profile
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); onNavigate('settings'); }}>
                  <Icon name="settings" size={16} /> Dashboard Settings
                </button>
                <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); onBackToWebsite(); }}>
                  <Icon name="globe" size={16} /> Back to Website
                </button>
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setUserMenuOpen(false); onSignOut(); }}>
                  <Icon name="logout" size={16} /> Sign out
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="db-top-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(value => !value)}
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: CommandItem[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setActiveIndex(0);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = oldOverflow;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 14);
    return items.filter(item => `${item.title} ${item.subtitle} ${item.group}`.toLowerCase().includes(q)).slice(0, 18);
  }, [items, search]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  if (!open) return null;

  return createPortal(
    <div className="db-cmd-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="db-cmd-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick command and search"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'ArrowDown' && filtered.length) {
            event.preventDefault();
            setActiveIndex(index => (index + 1) % filtered.length);
          }
          if (event.key === 'ArrowUp' && filtered.length) {
            event.preventDefault();
            setActiveIndex(index => (index - 1 + filtered.length) % filtered.length);
          }
          if (event.key === 'Enter' && filtered[activeIndex]) {
            event.preventDefault();
            const chosen = filtered[activeIndex];
            onClose();
            chosen.onSelect();
          }
        }}
      >
        <div className="db-cmd-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search holdings, stocks, ETFs, or jump to any tool..."
            aria-label="Command search"
          />
          <button type="button" className="db-cmd-esc" onClick={onClose}>ESC</button>
        </div>
        <div className="db-cmd-results">
          {filtered.length === 0 ? (
            <div className="db-cmd-empty">No matching assets, sections, or actions for &ldquo;{search}&rdquo;.</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                type="button"
                key={item.id}
                className={`db-cmd-item ${idx === activeIndex ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  onClose();
                  item.onSelect();
                }}
              >
                <span className="db-cmd-item-icon"><Icon name={item.icon} size={17} /></span>
                <span className="db-cmd-item-copy">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <span className="db-cmd-item-group">{item.badge || item.group}</span>
              </button>
            ))
          )}
        </div>
        <div className="db-cmd-foot">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DashboardFooter({
  onNavigate,
  onBackToWebsite,
  onExportCsv,
  onResetSample,
  onOpenSupport,
  onOpenCareers,
}: {
  onNavigate: (section: DashboardSection) => void;
  onBackToWebsite: () => void;
  onExportCsv: () => void;
  onResetSample: () => void;
  onOpenSupport?: () => void;
  onOpenCareers?: () => void;
}) {
  const [digestEmail, setDigestEmail] = useState('');
  const [digestNote, setDigestNote] = useState('');

  const submitDigest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const existing: string[] = JSON.parse(localStorage.getItem('invemon-newsletter') || '[]');
      localStorage.setItem('invemon-newsletter', JSON.stringify([...new Set([...existing, digestEmail.trim().toLowerCase()])]));
    } catch { /* Optional browser storage */ }
    setDigestNote('Subscribed to the weekly Invemon Wealth Digest.');
    setDigestEmail('');
  };

  return (
    <footer className="db-site-footer" aria-label="Invemon platform footer">
      <div className="db-footer-inner">
        <div className="db-footer-status-bar">
          <div className="db-footer-status-pill">
            <span className="db-status-dot" />
            <span>All portfolio analytics &amp; CoinPaprika crypto feeds operational</span>
          </div>
          <div className="db-footer-trust-badges">
            <span><Icon name="shield" size={15} /> 256-bit TLS</span>
            <span><Icon name="repeat" size={15} /> Auto-Invest &amp; DRIP</span>
            <span><Icon name="file" size={15} /> Tax CSV Ready</span>
          </div>
          <div className="db-footer-quick-btns">
            <button type="button" className="db-footer-pill-btn" onClick={onExportCsv}>
              <Icon name="download" size={14} /> Export CSV
            </button>
            {onOpenSupport && (
              <button type="button" className="db-footer-pill-btn" onClick={onOpenSupport}>
                Help Center
              </button>
            )}
            <button type="button" className="db-footer-pill-btn is-lime" onClick={onBackToWebsite}>
              Website Home <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>

        <div className="db-footer-grid">
          <div className="db-footer-brand-col">
            <button type="button" className="db-footer-logo" onClick={onBackToWebsite} aria-label="Invemon home">
              <img src="/assets/Logo-brand-dark.png" alt="Invemon" width="200" />
            </button>
            <p>
              An all-in-one wealth &amp; investment workspace combining multi-asset tracking, automated DCA plans, dividend reinvestment, and AI portfolio health insights.
            </p>
            <form className="db-footer-digest" onSubmit={submitDigest}>
              <label className="sr-only" htmlFor="db-digest-email">Weekly market digest email</label>
              <input
                id="db-digest-email"
                type="email"
                placeholder="Weekly market digest email"
                value={digestEmail}
                onChange={event => setDigestEmail(event.target.value)}
                required
              />
              <button type="submit">Subscribe</button>
            </form>
            {digestNote && <span className="db-footer-digest-note" role="status">{digestNote}</span>}
          </div>

          <div className="db-footer-links-col">
            <h3>Workspace</h3>
            <button type="button" onClick={() => onNavigate('overview')}>Overview</button>
            <button type="button" onClick={() => onNavigate('portfolio')}>Portfolio &amp; Holdings</button>
            <button type="button" onClick={() => onNavigate('markets')}>Stock &amp; ETF Screener</button>
            <button type="button" onClick={() => onNavigate('crypto')}>Crypto Explorer</button>
            <button type="button" onClick={() => onNavigate('yield')}>Yield &amp; Dividends</button>
          </div>

          <div className="db-footer-links-col">
            <h3>Planning &amp; Tools</h3>
            <button type="button" onClick={() => onNavigate('autoinvest')}>Auto-Invest &amp; DCA</button>
            <button type="button" onClick={() => onNavigate('goals')}>Financial Goals</button>
            <button type="button" onClick={() => onNavigate('insights')}>AI Insights &amp; Rebalance</button>
            <button type="button" onClick={() => onNavigate('activity')}>Activity &amp; CSV Export</button>
            <button type="button" onClick={onResetSample}>Restore Sample Data</button>
          </div>

          <div className="db-footer-links-col">
            <h3>Support &amp; Contact</h3>
            {onOpenSupport && <button type="button" onClick={onOpenSupport}>Help Center &amp; FAQs</button>}
            {onOpenCareers && <button type="button" onClick={onOpenCareers}>Careers at Invemon</button>}
            <button type="button" onClick={() => onNavigate('settings')}>Account &amp; Privacy</button>
            <a href="tel:+123456789"><Icon name="call" size={16} /> +123 456 789</a>
            <a href="mailto:support@gravix.com"><Icon name="mail" size={16} /> support@gravix.com</a>
            <span className="db-footer-address">Sudirman Street 302, Metro, Lampung Indonesia.</span>
          </div>
        </div>

        <div className="db-footer-disclosure">
          <p>
            <strong>Important Disclosure:</strong> Invemon Wealth Portal is an interactive investment interface. Portfolio balances, simulated orders, APY cash sweep projections, and non-crypto market quotes on this workspace are illustrative sample data stored in your browser; cryptocurrency directory data is provided by CoinPaprika and may be delayed. Investing involves risk, including possible loss of principal. Past performance does not guarantee future results.
          </p>
        </div>

        <div className="db-footer-bottom">
          <p>Copyright &copy; 2025 Invemon. All rights reserved.</p>
          <p>Powered by Samtiv Studio</p>
          <div className="db-footer-socials">
            <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook">f</a>
            <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                <rect x="2" y="2" width="16" height="16" rx="5" />
                <circle cx="10" cy="10" r="4" />
                <circle cx="15" cy="5" r=".7" fill="currentColor" />
              </svg>
            </a>
            <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn">in</a>
            <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube"><Icon name="play" size={14} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
