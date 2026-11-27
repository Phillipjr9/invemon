import type { InvestmentAccount } from '../components/Dialogs';

export type StoredUserRecord = InvestmentAccount & {
  accountType?: 'Individual' | 'Joint' | 'Retirement';
  twoFactorMethod?: 'authenticator' | 'email' | 'none';
  passwordHash?: string;
  provider?: 'email' | 'google' | 'passkey';
  createdAt?: string;
};

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: {
    length: boolean;
    mixedCase: boolean;
    number: boolean;
    symbol: boolean;
  };
};

export type RiskBlueprint = {
  id: 'Conservative' | 'Balanced' | 'Growth' | 'Aggressive';
  tagline: string;
  expectedReturn: number;
  volatility: 'Low' | 'Moderate' | 'Elevated' | 'High';
  allocation: { label: string; pct: number; color: string }[];
};

export const RISK_BLUEPRINTS: RiskBlueprint[] = [
  {
    id: 'Conservative',
    tagline: 'Capital preservation with steady fixed-income yield',
    expectedReturn: 5.5,
    volatility: 'Low',
    allocation: [
      { label: 'Bonds', pct: 45, color: '#7280C7' },
      { label: 'ETFs', pct: 25, color: '#2B356B' },
      { label: 'Cash', pct: 20, color: '#E8DCC8' },
      { label: 'Stocks', pct: 10, color: '#C9A66B' },
    ],
  },
  {
    id: 'Balanced',
    tagline: 'Disciplined compounding across global equities and bonds',
    expectedReturn: 8.2,
    volatility: 'Moderate',
    allocation: [
      { label: 'ETFs', pct: 35, color: '#2B356B' },
      { label: 'Stocks', pct: 30, color: '#C9A66B' },
      { label: 'Bonds', pct: 20, color: '#7280C7' },
      { label: 'Crypto', pct: 5, color: '#D99B38' },
      { label: 'Cash', pct: 10, color: '#E8DCC8' },
    ],
  },
  {
    id: 'Growth',
    tagline: 'Equity-led appreciation with selective digital-asset exposure',
    expectedReturn: 10.6,
    volatility: 'Elevated',
    allocation: [
      { label: 'Stocks', pct: 45, color: '#C9A66B' },
      { label: 'ETFs', pct: 30, color: '#2B356B' },
      { label: 'Crypto', pct: 12, color: '#D99B38' },
      { label: 'Bonds', pct: 8, color: '#7280C7' },
      { label: 'Cash', pct: 5, color: '#E8DCC8' },
    ],
  },
  {
    id: 'Aggressive',
    tagline: 'High-conviction growth and maximum long-horizon upside',
    expectedReturn: 13.1,
    volatility: 'High',
    allocation: [
      { label: 'Stocks', pct: 52, color: '#C9A66B' },
      { label: 'ETFs', pct: 23, color: '#2B356B' },
      { label: 'Crypto', pct: 20, color: '#D99B38' },
      { label: 'Cash', pct: 5, color: '#E8DCC8' },
    ],
  },
];

export const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Singapore',
  'Switzerland',
  'Australia',
  'Germany',
  'Netherlands',
  'United Arab Emirates',
  'Indonesia',
  'Japan',
  'France',
  'Nigeria',
  'South Africa',
  'India',
  'Other',
];

export const PLAN_TIERS = [
  { id: 'Free', price: '$0', period: '/mo', highlight: 'Start with $1 · Core portfolios' },
  { id: 'Pro', price: '$9.99', period: '/mo', highlight: 'AI analytics · Priority desk', popular: true },
  { id: 'Premium', price: '$19.99', period: '/mo', highlight: 'Unlimited DCA · Expert briefs' },
  { id: 'Elite', price: '$24.99', period: '/mo', highlight: 'Dedicated advisor · VIP access' },
];

export const GOOGLE_DEMO_ACCOUNTS = [
  { name: 'Alex Morgan', email: 'alex.morgan@gmail.com', avatar: 'AM', role: 'Private Wealth Client · Pro Plan' },
  { name: 'Jordan Taylor', email: 'jordan.taylor@gmail.com', avatar: 'JT', role: 'Portfolio Member · Elite Plan' },
];

const REGISTRY_KEY = 'invemon-auth-registry';
const ACTIVE_KEY = 'invemon-account';

export function evaluatePassword(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const score = (password.length === 0 ? 0 : Math.min(4, Math.max(1, passed))) as PasswordStrength['score'];
  const labels: Record<PasswordStrength['score'], string> = {
    0: 'Enter password',
    1: 'Weak',
    2: 'Fair',
    3: 'Strong',
    4: 'Institutional',
  };
  return { score, label: labels[score], checks };
}

export function projectTenYearValue(monthly: number, annualReturnPct: number): number {
  const safeMonthly = Math.max(0, Number.isFinite(monthly) ? monthly : 0);
  const r = annualReturnPct / 100 / 12;
  const n = 120;
  if (r <= 0) return safeMonthly * n;
  return safeMonthly * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

export async function hashPassword(input: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(`invemon-v1:${input}`);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    /* Fall through to deterministic digest in non-secure contexts */
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export function getRegisteredUsers(): StoredUserRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function findRegisteredUser(email: string): StoredUserRecord | undefined {
  const normalized = email.trim().toLowerCase();
  return getRegisteredUsers().find(user => user.email.trim().toLowerCase() === normalized);
}

export function saveRegisteredUser(record: StoredUserRecord): void {
  try {
    const normalized = record.email.trim().toLowerCase();
    const existing = getRegisteredUsers().filter(user => user.email.trim().toLowerCase() !== normalized);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify([record, ...existing]));
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
  } catch {
    /* Storage optional in private sessions */
  }
}

export function persistActiveSession(account: InvestmentAccount): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(account));
  } catch {
    /* Storage optional */
  }
}

export function decodeJwtPayload(credential: string): { name?: string; email?: string } {
  const payload = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(payload));
}

export function loadGoogleIdentityScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in failed to load'));
    document.head.appendChild(script);
  });
}
