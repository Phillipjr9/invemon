import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon';
import type { InvestmentAccount } from '../components/Dialogs';
import CryptoMarket, { type CryptoView } from '../components/CryptoMarket';
import {
  CommandPalette,
  DashboardFooter,
  DashboardHeader,
  type CommandItem,
  type DashboardSection,
  type HeaderNotice,
} from '../components/DashboardChrome';
import './dashboard.css';
import TransactionSheet, { type TradeMode, type AssetOption } from '../components/TransactionSheet';
import './dashboard-editorial.css';
import { FUNDING_COINS, fundingReceipt, validateFunding, type FundingRequest, type FundingReceipt } from '../services/funding';
import { Wordmark } from './HomePage';
import EmailNotifications from '../components/EmailNotifications';
import ServerAccountTools from '../components/ServerAccountTools';
import WorkspaceSync from '../components/WorkspaceSync';
import { SERVER_ACCOUNTS } from '../services/api';
import { allocationTargets, monthlyEquivalent, dailyProfit, monthlyApyAccrual } from '../utils/investment-math';

type Props = {
  account: InvestmentAccount | null;
  onAccount?: (account: InvestmentAccount | null) => void;
  onBack: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onOpenSupport?: () => void;
  onOpenCareers?: () => void;
  onOpenProfile?: () => void;
};

type AssetClass = 'Stocks' | 'ETFs' | 'Bonds' | 'Crypto';
type AllocKey = AssetClass | 'Cash';
type Range = '1D' | '1W' | '1M' | '1Y' | 'ALL';
type ChartView = 'performance' | 'cashflow' | 'income';
type MarketFilter = 'all' | 'Stocks' | 'ETFs' | 'Dividend' | 'Bonds' | 'watchlist';
type ActivityKind = 'swap' | 'invest' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'auto' | 'rebalance';
type PlanFrequency = 'Weekly' | 'Bi-weekly' | 'Monthly';

type Holding = {
  symbol: string;
  name: string;
  cls: AssetClass;
  units: number;
  cost: number;
  price: number;
  day: number;
  divYield?: number;
  sector?: string;
};

type Quote = {
  symbol: string;
  name: string;
  cls: AssetClass;
  price: number;
  day: number;
  sector: string;
  divYield: number;
  low52: number;
  high52: number;
  metric: string;
};

type WatchItem = Quote & { spark: number[] };
type Activity = { id: string; kind: ActivityKind; title: string; detail: string; amount: number; date: string; funding?: FundingReceipt };
type Goal = { id: string; name: string; target: number; saved: number; dueYear: number; monthly: number };
type Plan = { id: string; name: string; symbol: string; amount: number; frequency?: PlanFrequency; active: boolean; nextRun: string };
type PriceAlert = { symbol: string; targetPrice: number; direction: 'above' | 'below' };
type Prefs = { valueMode: 'value' | 'percent'; hideBalances: boolean; alerts: boolean; dailySummary: boolean; drip: boolean };

type State = {
  schemaVersion: 3;
  cash: number;
  holdings: Holding[];
  watchlist: WatchItem[];
  activity: Activity[];
  goals: Goal[];
  plans: Plan[];
  priceAlerts: PriceAlert[];
  rebalanceQueued: boolean;
  prefs: Prefs;
  readNotificationIds: string[];
};

type TradeState = { mode: TradeMode; symbol?: string; goalId?: string } | null;
type GoalDraft = { name: string; target: string; years: string; monthly: string };
type PlanDraft = { name: string; symbol: string; amount: string; frequency: PlanFrequency };

const DAY = 86400000;
const CASH_APY = 4.65;
const CLASSES: AssetClass[] = ['Stocks', 'ETFs', 'Bonds', 'Crypto'];
const CLASS_COLORS: Record<AllocKey, string> = {
  Stocks: '#194637',
  ETFs: '#78966d',
  Bonds: '#b8c8a5',
  Crypto: '#bf9766',
  Cash: '#dce5c7',
};
const RANGE_KEYS: Range[] = ['1D', '1W', '1M', '1Y', 'ALL'];
const RANGES: Record<Range, { points: number; stepMs: number; ret: number; bench: number; vol: number }> = {
  '1D': { points: 48, stepMs: DAY / 96, ret: 0.82, bench: 0.61, vol: 0.012 },
  '1W': { points: 42, stepMs: DAY / 6, ret: 2.1, bench: 1.6, vol: 0.02 },
  '1M': { points: 30, stepMs: DAY, ret: 5.4, bench: 4.1, vol: 0.03 },
  '1Y': { points: 52, stepMs: DAY * 7, ret: 14.8, bench: 11.2, vol: 0.05 },
  ALL: { points: 60, stepMs: DAY * 30, ret: 38.2, bench: 31.5, vol: 0.06 },
};

const MARKET_UNIVERSE: Quote[] = [
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', cls: 'ETFs', price: 272.4, day: 0.42, sector: 'Broad US Equity', divYield: 1.38, low52: 224.1, high52: 281.5, metric: '0.03% ER' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', cls: 'ETFs', price: 504.8, day: 0.54, sector: 'Large Cap Blend', divYield: 1.32, low52: 412.0, high52: 516.2, metric: '0.03% ER' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', cls: 'ETFs', price: 452.1, day: 0.66, sector: 'Nasdaq-100 Tech', divYield: 0.58, low52: 368.4, high52: 468.9, metric: '0.20% ER' },
  { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', cls: 'ETFs', price: 82.65, day: 0.31, sector: 'Dividend Growth', divYield: 3.48, low52: 71.2, high52: 85.4, metric: '0.06% ER' },
  { symbol: 'AAPL', name: 'Apple Inc.', cls: 'Stocks', price: 195.25, day: 1.82, sector: 'Consumer Tech', divYield: 0.51, low52: 164.08, high52: 207.1, metric: '29.8x P/E' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', cls: 'Stocks', price: 428.15, day: 0.94, sector: 'Cloud & AI', divYield: 0.72, low52: 348.5, high52: 446.8, metric: '34.2x P/E' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', cls: 'Stocks', price: 131.4, day: 2.41, sector: 'Semiconductors', divYield: 0.03, low52: 75.6, high52: 140.76, metric: '42.1x P/E' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', cls: 'Stocks', price: 186.33, day: 0.58, sector: 'E-Commerce & Cloud', divYield: 0, low52: 144.05, high52: 201.2, metric: '36.5x P/E' },
  { symbol: 'META', name: 'Meta Platforms', cls: 'Stocks', price: 503.2, day: -0.34, sector: 'Digital Platforms', divYield: 0.4, low52: 390.4, high52: 542.8, metric: '25.4x P/E' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', cls: 'Stocks', price: 174.6, day: 0.77, sector: 'Search & Cloud', divYield: 0.46, low52: 130.7, high52: 191.75, metric: '23.9x P/E' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', cls: 'Stocks', price: 212.4, day: 0.48, sector: 'Financials', divYield: 2.24, low52: 162.3, high52: 220.8, metric: '12.1x P/E' },
  { symbol: 'TSLA', name: 'Tesla Inc.', cls: 'Stocks', price: 248.9, day: -0.62, sector: 'EV & Robotics', divYield: 0, low52: 138.8, high52: 271.0, metric: '61.0x P/E' },
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', cls: 'Bonds', price: 73.2, day: -0.18, sector: 'Investment Grade Bonds', divYield: 4.18, low52: 70.1, high52: 75.8, metric: '0.03% ER' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', cls: 'Bonds', price: 93.85, day: 0.25, sector: 'Long US Treasuries', divYield: 4.35, low52: 85.4, high52: 99.6, metric: '0.15% ER' },
];

const SECTIONS: { id: DashboardSection; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'portfolio', label: 'Portfolio', icon: 'layers' },
  { id: 'markets', label: 'Markets', icon: 'trend' },
  { id: 'crypto', label: 'Crypto', icon: 'coins' },
  { id: 'yield', label: 'Yield & Income', icon: 'percent' },
  { id: 'autoinvest', label: 'Auto-invest', icon: 'repeat' },
  { id: 'goals', label: 'Goals', icon: 'target' },
  { id: 'activity', label: 'Activity', icon: 'list' },
  { id: 'insights', label: 'Insights', icon: 'bulb' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const MOBILE_PRIMARY = new Set<DashboardSection>(['overview', 'portfolio', 'markets', 'crypto']);

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`;
const tone = (value: number) => (value >= 0 ? 'db-pos' : 'db-neg');
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const isoInDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const fmtWhen = (value: string) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function rng(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function makeSpark(base: number, seed: number): number[] {
  const random = rng(seed);
  let value = base * 0.96;
  const out: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    value *= 1 + (random() - 0.48) * 0.02;
    out.push(value);
  }
  out[out.length - 1] = base;
  return out;
}

function buildSeries(range: Range, total: number) {
  const cfg = RANGES[range];
  const walk = (seed: number, end: number) => {
    const random = rng(seed);
    const raw = [1];
    for (let i = 1; i < cfg.points; i += 1) raw.push(raw[i - 1] * (1 + (random() - 0.5) * cfg.vol));
    const shift = end - raw[raw.length - 1];
    return raw.map((value, i) => value + shift * (i / (cfg.points - 1)));
  };
  const scale = 1 + cfg.ret / 100;
  const start = total / scale;
  return {
    portfolio: walk(4217, scale).map(value => start * value),
    bench: walk(9311, 1 + cfg.bench / 100).map(value => start * value),
  };
}

function pointLabel(range: Range, index: number) {
  const cfg = RANGES[range];
  const when = new Date(Date.now() - (cfg.points - 1 - index) * cfg.stepMs);
  if (range === '1D') return when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (range === '1W') return when.toLocaleString('en-US', { weekday: 'short', hour: 'numeric' });
  if (range === '1M') return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return when.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function makeActivity(kind: ActivityKind, title: string, detail: string, amount: number): Activity {
  return { id: uid(), kind, title, detail, amount, date: new Date().toISOString() };
}

function lookupQuote(symbol: string, holdings: Holding[], watchlist: WatchItem[]): Quote | undefined {
  const fromUniverse = MARKET_UNIVERSE.find(item => item.symbol === symbol);
  if (fromUniverse) return fromUniverse;
  const fromWatch = watchlist.find(item => item.symbol === symbol);
  if (fromWatch) return fromWatch;
  const held = holdings.find(item => item.symbol === symbol);
  if (!held) return undefined;
  return {
    symbol: held.symbol,
    name: held.name,
    cls: held.cls,
    price: held.price,
    day: held.day,
    sector: held.sector || held.cls,
    divYield: held.divYield ?? 0,
    low52: held.price * 0.74,
    high52: held.price * 1.16,
    metric: held.cls === 'Crypto' ? '24/7 Spot' : 'Core Asset',
  };
}

function seedState(account: InvestmentAccount | null): State {
  const monthly = Number(account?.monthlyAmount) || 250;
  const year = new Date().getFullYear();
  const initialWatchSymbols = ['NVDA', 'VOO', 'SCHD', 'TSLA'];
  return {
    schemaVersion: 3,
    cash: 2250.8,
    holdings: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', cls: 'ETFs', units: 24.5, cost: 228, price: 272.4, day: 0.42, divYield: 1.38, sector: 'Broad US Equity' },
      { symbol: 'AAPL', name: 'Apple Inc.', cls: 'Stocks', units: 12, cost: 162.1, price: 195.25, day: 1.82, divYield: 0.51, sector: 'Consumer Tech' },
      { symbol: 'MSFT', name: 'Microsoft Corp.', cls: 'Stocks', units: 8, cost: 371, price: 428.15, day: 0.94, divYield: 0.72, sector: 'Cloud & AI' },
      { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', cls: 'Bonds', units: 40, cost: 76.5, price: 73.2, day: -0.18, divYield: 4.18, sector: 'Investment Grade Bonds' },
      { symbol: 'BTC', name: 'Bitcoin', cls: 'Crypto', units: 0.06, cost: 41000, price: 64420, day: 3.05, divYield: 0, sector: 'Digital Layer-1' },
      { symbol: 'ETH', name: 'Ethereum', cls: 'Crypto', units: 0.9, cost: 2600, price: 3420, day: 1.27, divYield: 0, sector: 'Smart Contracts' },
    ],
    watchlist: MARKET_UNIVERSE.filter(q => initialWatchSymbols.includes(q.symbol)).map((q, idx) => ({
      ...q,
      spark: makeSpark(q.price, idx * 17 + 11),
    })),
    activity: [
      makeActivity('auto', 'Auto-invest completed', 'Core growth portfolio · VTI', -monthly),
      makeActivity('dividend', 'Dividend received', 'Vanguard Total Bond Market ETF · BND', 18.42),
      makeActivity('dividend', 'High-Yield Cash interest', '4.65% APY monthly sweep payout', 8.72),
      makeActivity('deposit', 'Deposit received', 'Bank transfer · Instant buying power', 500),
      makeActivity('invest', 'Bought Apple Inc.', 'AAPL · 1.2 units', -234.3),
    ].map((item, index) => ({ ...item, date: isoDaysAgo([1, 3, 5, 9, 12][index]) })),
    goals: [
      { id: 'goal-main', name: account?.goal || 'Long-term growth', target: 15000, saved: 10200, dueYear: year + 5, monthly },
      { id: 'goal-emergency', name: 'Emergency reserve', target: 6000, saved: 4100, dueYear: year + 1, monthly: 150 },
      { id: 'goal-home', name: 'First home down payment', target: 40000, saved: 8200, dueYear: year + 8, monthly: 400 },
    ],
    plans: [
      { id: 'core', name: 'Core growth portfolio', symbol: 'VTI', amount: monthly, frequency: 'Monthly', active: true, nextRun: isoInDays(9) },
      { id: 'bonds', name: 'Stability income reserve', symbol: 'BND', amount: 100, frequency: 'Monthly', active: true, nextRun: isoInDays(16) },
      { id: 'crypto', name: 'Digital asset builder', symbol: 'BTC', amount: 25, frequency: 'Weekly', active: false, nextRun: isoInDays(7) },
    ],
    priceAlerts: [
      { symbol: 'AAPL', targetPrice: 205, direction: 'above' },
      { symbol: 'NVDA', targetPrice: 120, direction: 'below' },
    ],
    rebalanceQueued: false,
    prefs: { valueMode: 'value', hideBalances: false, alerts: true, dailySummary: true, drip: true },
    readNotificationIds: [],
  };
}

function applyBuy(
  state: State,
  symbol: string,
  dollars: number,
  kind: ActivityKind = 'invest',
  title?: string,
): { next: State } | { error: string } {
  if (!Number.isFinite(dollars) || dollars < 1) return { error: 'Enter an amount of at least $1.' };
  if (dollars > state.cash + 0.001) return { error: 'That amount is more than your available cash.' };
  const held = state.holdings.find(h => h.symbol === symbol);
  const quote = lookupQuote(symbol, state.holdings, state.watchlist);
  const source = held ?? quote;
  if (!source) return { error: 'This asset is not available yet.' };
  const units = dollars / source.price;
  const holdings: Holding[] = held
    ? state.holdings.map(h =>
        h.symbol === symbol
          ? { ...h, units: h.units + units, cost: (h.units * h.cost + dollars) / (h.units + units) }
          : h,
      )
    : [
        ...state.holdings,
        {
          symbol,
          name: source.name,
          cls: source.cls,
          units,
          cost: source.price,
          price: source.price,
          day: source.day,
          divYield: quote?.divYield ?? 0,
          sector: quote?.sector ?? source.cls,
        },
      ];
  return {
    next: {
      ...state,
      cash: state.cash - dollars,
      holdings,
      activity: [makeActivity(kind, title ?? `Bought ${symbol}`, `${symbol} · ${units.toFixed(4)} units`, -dollars), ...state.activity],
    },
  };
}

function applySell(state: State, symbol: string, dollars: number): { next: State } | { error: string } {
  if (!Number.isFinite(dollars) || dollars < 1) return { error: 'Enter an amount of at least $1.' };
  const holding = state.holdings.find(item => item.symbol === symbol);
  if (!holding) return { error: `You do not own ${symbol} yet.` };
  const positionValue = holding.units * holding.price;
  if (dollars > positionValue + 0.001) return { error: `The maximum sale value is ${money(positionValue)}.` };
  const units = Math.min(holding.units, dollars / holding.price);
  const remaining = holding.units - units;
  const holdings = remaining < 0.00000001
    ? state.holdings.filter(item => item.symbol !== symbol)
    : state.holdings.map(item => (item.symbol === symbol ? { ...item, units: remaining } : item));
  return {
    next: {
      ...state,
      cash: state.cash + dollars,
      holdings,
      activity: [makeActivity('sell', `Sold ${symbol}`, `${symbol} · ${units.toFixed(5)} units`, dollars), ...state.activity],
    },
  };
}

function buildSeriesCacheKey(range: Range, total: number) {
  return `${range}-${Math.round(total)}`;
}

function PerformanceChart({ portfolio, bench, range, valueText, hideBalances }: { portfolio: number[]; bench: number[]; range: Range; valueText: (value: number) => string; hideBalances: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = 250;
  const P = 14;
  const n = portfolio.length;
  const all = [...portfolio, ...bench];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => P + (1 - (v - min) / span) * (H - P * 2);
  const path = (values: number[]) => values.map((value, i) => {
    if (i === 0) return `M${x(i).toFixed(1)} ${y(value).toFixed(1)}`;
    const middle = ((x(i - 1) + x(i)) / 2).toFixed(1);
    return `C${middle} ${y(values[i - 1]).toFixed(1)} ${middle} ${y(value).toFixed(1)} ${x(i).toFixed(1)} ${y(value).toFixed(1)}`;
  }).join(' ');
  const line = path(portfolio);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const index = hover ?? n - 1;
  const delta = ((portfolio[index] - portfolio[0]) / portfolio[0]) * 100;
  const benchDelta = ((bench[index] - bench[0]) / bench[0]) * 100;
  const alpha = delta - benchDelta;
  const periodGain = portfolio[index] - portfolio[0];
  const periodLabel = range === '1D' ? 'today' : range === '1W' ? 'this week' : range === '1M' ? 'this month' : range === '1Y' ? 'this year' : 'all time';
  const valueLabel = hover === null ? `${periodLabel[0].toUpperCase()}${periodLabel.slice(1)} portfolio return` : `Portfolio value · ${pointLabel(range, index)}`;
  const headlineValue = hover === null
    ? `${periodGain >= 0 ? '+' : '−'}${valueText(Math.abs(periodGain))}`
    : valueText(portfolio[index]);
  const displayedDelta = hideBalances ? pct(delta) : headlineValue;

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setHover(Math.round(ratio * (n - 1)));
  };

  return (
    <div>
      <div className="db-chart-meta">
        <div>
          <span className="db-muted db-small">{valueLabel}</span>
          <strong>{displayedDelta}</strong>
        </div>
        <div className="db-chart-deltas">
          <span className={tone(delta)}>{delta >= 0 ? '▲' : '▼'} {pct(delta)} period return</span>
          <span className="db-muted">S&amp;P 500 {pct(benchDelta)}</span>
          <span className={`db-tag ${alpha >= 0 ? '' : 'warn'}`}>Alpha {pct(alpha)}</span>
        </div>
      </div>
      <div className="db-chart-plot" tabIndex={0} aria-label="Portfolio chart. Use left and right arrow keys to inspect sample values." onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)} onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover(current => clamp((current ?? n - 1) + (event.key === 'ArrowLeft' ? -1 : 1), 0, n - 1)); }
        if (event.key === 'Escape') setHover(null);
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Portfolio performance over ${range}, ${pct(delta)} against a benchmark of ${pct(benchDelta)}`}>
          <defs>
            <linearGradient id="db-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#2b624a" stopOpacity=".32" />
              <stop offset="1" stopColor="#2b624a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(step => (
            <line key={step} x1="0" x2={W} y1={H * step} y2={H * step} stroke="#edf0e7" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#db-area-fill)" />
          <path d={path(bench)} fill="none" stroke="#a5b58f" strokeWidth="2" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke="#2b624a" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <>
              <line x1={x(index)} x2={x(index)} y1="0" y2={H} stroke="#737681" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <circle cx={x(index)} cy={y(portfolio[index])} r="6" fill="#2b624a" stroke="white" strokeWidth="2" />
            </>
          )}
        </svg>
      </div>
      <div className="db-chart-axis" aria-hidden="true">{[0, .25, .5, .75, 1].map(step => <span key={step}>{pointLabel(range, Math.round(step * (n - 1)))}</span>)}</div>
      <div className="db-chart-legend">
        <span><i style={{ background: '#2b624a' }} />Your portfolio</span>
        <span><i style={{ background: '#a5b58f' }} />S&amp;P 500 benchmark</span>
        <span>Synthetic illustration · not actual returns</span>
      </div>
    </div>
  );
}

function CashFlowBars({ monthlyPlan, gain, valueText }: { monthlyPlan: number; gain: number; valueText: (v: number) => string }) {
  const base = Math.max(150, monthlyPlan || 250);
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const rows = months.map((label, idx) => ({
    label,
    contributed: Math.round(base * (0.9 + (idx % 3) * 0.1)),
    growth: Math.round(Math.max(45, gain / 10) * (0.65 + idx * 0.14)),
  }));
  const maxVal = Math.max(...rows.map(r => r.contributed + r.growth), 1);

  return (
    <div className="db-bars-view">
      <div className="db-chart-meta">
        <div>
          <span className="db-muted db-small">6-month capital additions vs compounding</span>
          <strong>{valueText(rows.reduce((s, r) => s + r.contributed + r.growth, 0))}</strong>
        </div>
        <div className="db-chart-deltas">
          <span><i className="db-inline-swatch" style={{ background: '#0f1326' }} /> Contributions</span>
          <span><i className="db-inline-swatch" style={{ background: '#2b624a' }} /> Market growth</span>
        </div>
      </div>
      <div className="db-bar-columns" role="img" aria-label="Six month contributions and market growth bars">
        {rows.map(row => {
          const totalBar = row.contributed + row.growth;
          const contribH = (row.contributed / maxVal) * 165;
          const growthH = (row.growth / maxVal) * 165;
          return (
            <div className="db-bar-col" key={row.label}>
              <span className="db-bar-val">{valueText(totalBar)}</span>
              <div className="db-bar-stack">
                <span className="db-bar-seg growth" style={{ height: `${growthH}px` }} title={`Growth: ${money(row.growth)}`} />
                <span className="db-bar-seg contrib" style={{ height: `${contribH}px` }} title={`Contributed: ${money(row.contributed)}`} />
              </div>
              <span className="db-bar-lbl">{row.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IncomeBars({ annualPassive, monthlyCashYield, valueText }: { annualPassive: number; monthlyCashYield: number; valueText: (v: number) => string }) {
  const monthlyAvg = annualPassive / 12;
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const weights = [0.88, 0.76, 0.94, 1.24, 0.85, 1.15];
  const rows = months.map((label, idx) => ({
    label,
    dividends: Math.max(6, (monthlyAvg - monthlyCashYield) * weights[idx]),
    cashYield: Math.max(4, monthlyCashYield * (0.95 + idx * 0.02)),
  }));
  const maxVal = Math.max(...rows.map(r => r.dividends + r.cashYield), 1);

  return (
    <div className="db-bars-view">
      <div className="db-chart-meta">
        <div>
          <span className="db-muted db-small">Estimated annual passive income run-rate</span>
          <strong>{valueText(annualPassive)} / yr</strong>
        </div>
        <div className="db-chart-deltas">
          <span><i className="db-inline-swatch" style={{ background: '#2b356b' }} /> Dividends</span>
          <span><i className="db-inline-swatch" style={{ background: '#ace238' }} /> {CASH_APY}% Cash APY</span>
        </div>
      </div>
      <div className="db-bar-columns" role="img" aria-label="Monthly dividend and cash yield income bars">
        {rows.map(row => {
          const sum = row.dividends + row.cashYield;
          return (
            <div className="db-bar-col" key={row.label}>
              <span className="db-bar-val">{valueText(sum)}</span>
              <div className="db-bar-stack">
                <span className="db-bar-seg cash-yield" style={{ height: `${(row.cashYield / maxVal) * 165}px` }} />
                <span className="db-bar-seg div-yield" style={{ height: `${(row.dividends / maxVal) * 165}px` }} />
              </div>
              <span className="db-bar-lbl">{row.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Donut({ parts }: { parts: { key: string; pct: number; color: string }[] }) {
  const circumference = 2 * Math.PI * 48;
  let offset = 0;
  return (
    <svg className="db-donut" viewBox="0 0 120 120" role="img" aria-label="Portfolio allocation">
      <circle cx="60" cy="60" r="48" fill="none" stroke="#edf0e7" strokeWidth="16" />
      {parts.map(part => {
        const length = (part.pct / 100) * circumference;
        const segment = (
          <circle
            key={part.key}
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={part.color}
            strokeWidth="16"
            strokeDasharray={`${Math.max(0, length - 1)} ${circumference}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += length;
        return segment;
      })}
    </svg>
  );
}

function Spark({ data }: { data: number[] }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 84;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg className="db-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={up ? '#5f9a12' : '#b42318'} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function AssetInspectorModal({
  quote,
  holding,
  totalPortfolio,
  watched,
  existingAlert,
  onToggleWatch,
  onSaveAlert,
  onRemoveAlert,
  onBuy,
  onSell,
  onClose,
}: {
  quote: Quote;
  holding?: Holding;
  totalPortfolio: number;
  watched: boolean;
  existingAlert?: PriceAlert;
  onToggleWatch: () => void;
  onSaveAlert: (alert: PriceAlert) => void;
  onRemoveAlert: (symbol: string) => void;
  onBuy: () => void;
  onSell: () => void;
  onClose: () => void;
}) {
  const spark = useMemo(() => makeSpark(quote.price, quote.symbol.charCodeAt(0) * 31 + 9), [quote.price, quote.symbol]);
  const [alertPrice, setAlertPrice] = useState(String(existingAlert?.targetPrice ?? Math.round(quote.price * 1.05 * 100) / 100));
  const [direction, setDirection] = useState<'above' | 'below'>(existingAlert?.direction ?? 'above');

  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const span = max - min || 1;
  const W = 520;
  const H = 140;
  const line = spark.map((v, idx) => `${idx === 0 ? 'M' : 'L'}${((idx / (spark.length - 1)) * W).toFixed(1)} ${(12 + (1 - (v - min) / span) * (H - 24)).toFixed(1)}`).join(' ');
  const rangePct = clamp(((quote.price - quote.low52) / Math.max(0.01, quote.high52 - quote.low52)) * 100, 2, 98);
  const posValue = holding ? holding.units * holding.price : 0;
  const posReturn = holding ? ((holding.price - holding.cost) / holding.cost) * 100 : 0;
  const posWeight = totalPortfolio > 0 ? (posValue / totalPortfolio) * 100 : 0;

  return createPortal(
    <div className="db-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="db-modal db-inspector-modal" role="dialog" aria-modal="true" aria-labelledby="db-inspector-title">
        <div className="db-modal-head">
          <div>
            <span className="db-tag info">{quote.cls} · {quote.sector}</span>
            <h2 id="db-inspector-title" style={{ marginTop: 8 }}>{quote.symbol} · {quote.name}</h2>
          </div>
          <button className="db-icon-btn" onClick={onClose} aria-label="Close asset details"><Icon name="close" size={20} /></button>
        </div>

        <div className="db-inspector-price-row">
          <div>
            <span className="db-muted db-small">Sample reference price</span>
            <strong>{money(quote.price)}</strong>
          </div>
          <span className={`db-tag ${quote.day >= 0 ? '' : 'neg'}`}>{quote.day >= 0 ? '▲' : '▼'} {pct(quote.day)} today</span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="db-inspector-chart" role="img" aria-label={`${quote.symbol} 30 day sample trend`}>
          <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="#2b624a22" />
          <path d={line} fill="none" stroke="#2b624a" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>

        <div className="db-range-bar-wrap">
          <div className="db-row-between db-small db-muted">
            <span>52W Low: {money(quote.low52)}</span>
            <span>{quote.metric} · Yield {quote.divYield.toFixed(2)}%</span>
            <span>52W High: {money(quote.high52)}</span>
          </div>
          <div className="db-52w-track">
            <span className="db-52w-fill" style={{ width: `${rangePct}%` }} />
            <i className="db-52w-thumb" style={{ left: `${rangePct}%` }} />
          </div>
        </div>

        {holding ? (
          <div className="db-inspector-position">
            <h3>Your Position</h3>
            <div className="db-inspector-metrics">
              <div><span>Market value</span><strong>{money(posValue)}</strong></div>
              <div><span>Units held</span><strong>{holding.units.toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong></div>
              <div><span>Avg cost</span><strong>{money(holding.cost)}</strong></div>
              <div><span>Total return</span><strong className={tone(posReturn)}>{pct(posReturn)} ({posWeight.toFixed(1)}% wt)</strong></div>
            </div>
          </div>
        ) : (
          <p className="db-muted db-small" style={{ marginTop: 12 }}>You do not currently hold {quote.symbol} in your sample portfolio.</p>
        )}

        <form
          className="db-inspector-alert-box"
          onSubmit={event => {
            event.preventDefault();
            const targetPrice = Number(alertPrice);
            if (targetPrice > 0) onSaveAlert({ symbol: quote.symbol, targetPrice, direction });
          }}
        >
          <div className="db-row-between">
            <strong><Icon name="bell" size={15} /> Price reminder</strong>
            {existingAlert && (
              <button type="button" className="db-text-danger" onClick={() => onRemoveAlert(quote.symbol)}>
                Clear ({existingAlert.direction} {money(existingAlert.targetPrice)})
              </button>
            )}
          </div>
          <div className="db-inspector-alert-controls">
            <select value={direction} onChange={event => setDirection(event.target.value as 'above' | 'below')} aria-label="Alert condition">
              <option value="above">Rises above</option>
              <option value="below">Drops below</option>
            </select>
            <input type="number" min="0.01" step="0.01" value={alertPrice} onChange={event => setAlertPrice(event.target.value)} aria-label="Target price in USD" required />
            <button type="submit" className="db-btn ghost">Set alert</button>
          </div>
        </form>

        <div className="db-inspector-actions">
          <button type="button" className="button button-lime" onClick={onBuy}>Buy {quote.symbol}</button>
          {holding && <button type="button" className="db-btn" onClick={onSell}>Sell {quote.symbol}</button>}
          {quote.cls !== 'Crypto' && (
            <button type="button" className="db-btn ghost" onClick={onToggleWatch}>
              <Icon name="star" size={15} /> {watched ? 'Saved' : 'Watchlist'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RebalanceModal({
  allocation,
  total,
  onApply,
  onClose,
}: {
  allocation: { key: AllocKey; value: number; weight: number; target: number; diff: number }[];
  total: number;
  onApply: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="db-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="db-modal db-inspector-modal" role="dialog" aria-modal="true" aria-labelledby="db-rebal-title">
        <div className="db-modal-head">
          <div>
            <span className="db-tag info">AI Portfolio Alignment</span>
            <h2 id="db-rebal-title" style={{ marginTop: 8 }}>1-Click Rebalance Preview</h2>
          </div>
          <button className="db-icon-btn" onClick={onClose} aria-label="Close rebalance preview"><Icon name="close" size={20} /></button>
        </div>
        <p className="db-muted db-small">
          Review the simulated adjustments required to align your {money(total)} portfolio back to your target risk weights.
        </p>
        <ul className="db-list" style={{ marginTop: 16 }}>
          {allocation.map(item => {
            const targetDollars = (item.target / 100) * total;
            const deltaDollars = targetDollars - item.value;
            return (
              <li key={item.key}>
                <div>
                  <strong>{item.key}</strong>
                  <small>Current {item.weight.toFixed(1)}% → Target {item.target}%</small>
                </div>
                <span className={`db-num ${Math.abs(deltaDollars) < 10 ? 'db-muted' : deltaDollars > 0 ? 'db-pos' : 'db-neg'}`}>
                  {Math.abs(deltaDollars) < 10 ? 'On target' : `${deltaDollars > 0 ? 'Buy +' : 'Trim −'}${money(Math.abs(deltaDollars))}`}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="db-btn-row" style={{ marginTop: 22 }}>
          <button type="button" className="button button-lime full-width" onClick={onApply}>
            Apply Sample Rebalance <Icon name="check" size={17} />
          </button>
        </div>
        <p className="db-muted db-small" style={{ marginTop: 10 }}>
          Updates sample holdings in your browser to match target weights. No live brokerage orders are transmitted.
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default function DashboardPage({
  account,
  onAccount,
  onBack,
  onSignUp,
  onSignOut,
  onOpenSupport,
  onOpenCareers,
  onOpenProfile,
}: Props) {
  const TARGET = allocationTargets(account?.risk);
  const storageKey = `invemon-dashboard:${account?.email || 'guest'}`;
  const cryptoStorageKey = `invemon-crypto-watchlist:${account?.email?.trim().toLowerCase() || 'guest'}`;

  const [state, setState] = useState<State>(() => {
    const defaults = seedState(account);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<State>;
        if (Array.isArray(parsed.holdings) && Array.isArray(parsed.goals)) {
          return {
            ...defaults,
            ...parsed,
            schemaVersion: 3,
            prefs: { ...defaults.prefs, ...parsed.prefs },
            priceAlerts: Array.isArray(parsed.priceAlerts) ? parsed.priceAlerts : defaults.priceAlerts,
            readNotificationIds: Array.isArray(parsed.readNotificationIds) ? parsed.readNotificationIds : [],
          } as State;
        }
      }
    } catch { /* Use seeded data when storage is unavailable. */ }
    return defaults;
  });

  const [section, setSection] = useState<DashboardSection>('overview');
  const [chartView, setChartView] = useState<ChartView>('performance');
  const [cryptoView, setCryptoView] = useState<CryptoView>('all');
  const [cryptoFavorites, setCryptoFavorites] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(cryptoStorageKey) || '[]');
      return Array.isArray(saved) ? [...new Set(saved.filter((item): item is string => typeof item === 'string'))] : [];
    } catch { return []; }
  });
  const [range, setRange] = useState<Range>('1M');
  const [trade, setTrade] = useState<TradeState>(null);
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'value' | 'return' | 'name'>('value');
  const [filter, setFilter] = useState<'all' | 'invest' | 'cash' | 'income'>('all');
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Storage is optional. */ }
  }, [state, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(cryptoStorageKey, JSON.stringify(cryptoFavorites)); } catch { /* Storage is optional. */ }
  }, [cryptoFavorites, cryptoStorageKey]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTrade(null);
        setGoalDraft(null);
        setPlanDraft(null);
        setInspectedSymbol(null);
        setRebalanceOpen(false);
        setMobileMoreOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setMobileMoreOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const M = (value: number) => (state.prefs.hideBalances ? '••••••' : money(value));
  const holdingValue = (h: Holding) => h.units * h.price;
  const invested = state.holdings.reduce((sum, h) => sum + holdingValue(h), 0);
  const costBasis = state.holdings.reduce((sum, h) => sum + h.units * h.cost, 0);
  const total = invested + state.cash;
  const gain = invested - costBasis;
  const gainPct = costBasis ? (gain / costBasis) * 100 : 0;
  const dayChange = state.holdings.reduce((sum, h) => sum + dailyProfit(holdingValue(h), h.day), 0);
  const dayPct = total - dayChange ? (dayChange / (total - dayChange)) * 100 : 0;
  const classValue = (cls: AssetClass) => state.holdings.filter(h => h.cls === cls).reduce((sum, h) => sum + holdingValue(h), 0);

  const allocation: { key: AllocKey; value: number; weight: number; target: number; diff: number }[] = [
    ...CLASSES.map(cls => ({ key: cls as AllocKey, value: classValue(cls) })),
    { key: 'Cash' as AllocKey, value: state.cash },
  ].map(item => {
    const weight = total ? (item.value / total) * 100 : 0;
    const target = TARGET[item.key];
    return { ...item, weight, target, diff: weight - target };
  });

  const drift = allocation.filter(a => Math.abs(a.weight - a.target) >= 5);
  const healthScore = Math.max(0, Math.round(100 - allocation.reduce((sum, a) => sum + Math.abs(a.weight - a.target), 0) / 2));
  const topHolding = [...state.holdings].sort((a, b) => holdingValue(b) - holdingValue(a))[0];
  const topWeight = topHolding && total ? (holdingValue(topHolding) / total) * 100 : 0;
  const losers = state.holdings.filter(h => h.price < h.cost);
  const monthlyPlan = state.plans.filter(p => p.active).reduce((sum, p) => sum + monthlyEquivalent(p.amount, p.frequency), 0);
  const annualFee = invested * 0.0025;
  const riskLabel = account?.risk || 'Balanced';
  const yearReturn = RANGES['1Y'].ret;
  const yearBench = RANGES['1Y'].bench;

  const annualCashInterest = state.cash * (CASH_APY / 100);
  const monthlyCashInterest = monthlyApyAccrual(state.cash, CASH_APY);
  const dividendHoldings = state.holdings.filter(h => (h.divYield ?? lookupQuote(h.symbol, state.holdings, state.watchlist)?.divYield ?? 0) > 0);
  const annualDividendIncome = dividendHoldings.reduce((sum, h) => {
    const yld = h.divYield ?? lookupQuote(h.symbol, state.holdings, state.watchlist)?.divYield ?? 0;
    return sum + holdingValue(h) * (yld / 100);
  }, 0);
  const annualPassiveIncome = annualCashInterest + annualDividendIncome;

  const estimatedInTenYears = (() => {
    const r = 0.07 / 12;
    const n = 120;
    return monthlyPlan * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
  })();

  const goalMath = (goal: Goal) => {
    const months = Math.max(1, (goal.dueYear - new Date().getFullYear()) * 12);
    const projected = goal.saved + goal.monthly * months;
    const needed = Math.max(0, (goal.target - goal.saved) / months);
    return { months, projected, needed, onTrack: projected >= goal.target, pct: clamp((goal.saved / goal.target) * 100, 0, 100) };
  };

  const seriesKey = buildSeriesCacheKey(range, total);
  const series = useMemo(() => buildSeries(range, total), [seriesKey]);
  const upcomingPlans = state.plans.filter(plan => plan.active).sort((a, b) => Date.parse(a.nextRun) - Date.parse(b.nextRun));
  const nextPlan = upcomingPlans[0];
  const nextPlanDate = nextPlan ? new Date(nextPlan.nextRun) : null;
  const nextPlanDays = nextPlanDate ? Math.ceil((nextPlanDate.getTime() - Date.now()) / DAY) : null;
  const atRiskGoals = state.goals.filter(goal => !goalMath(goal).onTrack);

  const generatedNotifications: HeaderNotice[] = [
    ...(drift.length ? [{ id: 'allocation-drift', icon: 'chart', level: 'warn' as const, title: 'Allocation has drifted', body: `${drift.map(item => item.key).join(', ')} moved outside your target range. Preview a 1-click rebalance.`, section: 'insights' as DashboardSection, action: 'Review allocation' }] : []),
    ...(atRiskGoals.length ? [{ id: 'goal-pace', icon: 'target', level: 'info' as const, title: 'Check your savings pace', body: `${atRiskGoals[0].name} may need a higher monthly contribution to meet its target.`, section: 'goals' as DashboardSection, action: 'Review goal' }] : []),
    ...(nextPlan && nextPlanDays !== null ? [{ id: `auto-${nextPlan.id}`, icon: 'repeat', level: 'info' as const, title: 'Next automatic investment', body: `${nextPlan.name}: ${M(nextPlan.amount)} scheduled ${nextPlanDays <= 0 ? 'today' : `in ${nextPlanDays} days`}.`, section: 'autoinvest' as DashboardSection, action: 'Review schedule' }] : []),
    ...(state.cash < 500 ? [{ id: 'low-cash', icon: 'wallet', level: 'warn' as const, title: 'Available cash is running low', body: `Your cash balance is ${M(state.cash)}. Review your scheduled investment plans.`, section: 'autoinvest' as DashboardSection, action: 'Review plans', task: 'deposit' as const }] : []),
  ];
  const dashboardNotifications = state.prefs.alerts ? generatedNotifications : [];
  const unreadCount = dashboardNotifications.filter(item => !state.readNotificationIds.includes(item.id)).length;
  const nextStep: HeaderNotice = generatedNotifications[0] || {
    id: 'steady-plan',
    icon: 'check',
    level: 'info',
    title: 'Your portfolio is aligned with targets',
    body: 'Every asset class is within 5% of target weight and your cash sweep is earning 4.65% APY.',
    section: 'yield',
    action: 'View yield & income',
  };

  const showToast = useCallback((message: string) => setToast(message), []);
  const navigateDashboard = useCallback((next: DashboardSection) => {
    setSection(next);
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const assetOptions: AssetOption[] = useMemo(() => {
    const map = new Map<string, AssetOption>();
    state.holdings.forEach(h => map.set(h.symbol, { symbol: h.symbol, name: h.name, price: h.price, units: h.units }));
    MARKET_UNIVERSE.forEach(q => {
      if (!map.has(q.symbol)) map.set(q.symbol, { symbol: q.symbol, name: q.name, price: q.price, units: 0 });
    });
    return [...map.values()];
  }, [state.holdings]);

  const openTrade = useCallback((mode: TradeMode, symbol?: string, goalId?: string) => {
    setTrade({ mode, symbol, goalId });
  }, []);

  const exportCsv = useCallback(() => {
    const rows = [['Date', 'Type', 'Description', 'Amount'], ...state.activity.map(a => [new Date(a.date).toISOString(), a.kind, `${a.title} - ${a.detail}`, a.amount.toFixed(2)])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'invemon-activity.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Activity exported as CSV');
  }, [showToast, state.activity]);

  const resetDemo = useCallback(() => {
    if (!window.confirm('Reset this device’s demo portfolio? Export a backup first if needed.')) return;
    try { localStorage.removeItem(storageKey); } catch { /* Nothing to clear. */ }
    setState(seedState(account));
    showToast('Sample portfolio restored');
  }, [account, showToast, storageKey]);

  const commandItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      { id: 'act-deposit', group: 'Actions', title: 'Deposit Cash', subtitle: 'Add sample USD buying power (4.65% APY sweep)', icon: 'plus', badge: 'Quick Action', onSelect: () => openTrade('deposit') },
      { id: 'act-swap', group: 'Actions', title: 'Swap assets', subtitle: 'Exchange one sample holding for another', icon: 'repeat', onSelect: () => openTrade('swap') },
      { id: 'act-buy', group: 'Actions', title: 'Buy Stock, ETF, or Crypto', subtitle: 'Open order ticket for your portfolio', icon: 'trend', badge: 'Quick Action', onSelect: () => openTrade('invest') },
      { id: 'act-sell', group: 'Actions', title: 'Sell Position', subtitle: 'Trim or exit an existing holding', icon: 'chart', badge: 'Quick Action', onSelect: () => openTrade('sell') },
      { id: 'act-rebal', group: 'Actions', title: '1-Click Portfolio Rebalance', subtitle: 'Preview & align asset classes to target weights', icon: 'sliders', badge: 'AI Tool', onSelect: () => setRebalanceOpen(true) },
      { id: 'act-csv', group: 'Actions', title: 'Export Activity CSV', subtitle: 'Download full ledger for tax & record keeping', icon: 'download', badge: 'Export', onSelect: exportCsv },
    ];
    const navItems: CommandItem[] = SECTIONS.map(s => ({
      id: `sec-${s.id}`,
      group: 'Sections',
      title: `Go to ${s.label}`,
      subtitle: `Switch workspace to ${s.label}`,
      icon: s.icon,
      onSelect: () => navigateDashboard(s.id),
    }));
    const marketItems: CommandItem[] = MARKET_UNIVERSE.map(q => ({
      id: `ast-${q.symbol}`,
      group: 'Assets',
      title: `${q.symbol} · ${q.name}`,
      subtitle: `${q.cls} · ${q.sector} · ${money(q.price)}`,
      icon: 'trend',
      badge: pct(q.day),
      onSelect: () => setInspectedSymbol(q.symbol),
    }));
    return [...actions, ...navItems, ...marketItems];
  }, [exportCsv, navigateDashboard, openTrade]);

  const watchedSet = useMemo(() => new Set(state.watchlist.map(w => w.symbol)), [state.watchlist]);

  const screenerRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MARKET_UNIVERSE.filter(item => {
      if (marketFilter === 'watchlist' && !watchedSet.has(item.symbol)) return false;
      if (marketFilter === 'Stocks' && item.cls !== 'Stocks') return false;
      if (marketFilter === 'ETFs' && item.cls !== 'ETFs') return false;
      if (marketFilter === 'Bonds' && item.cls !== 'Bonds') return false;
      if (marketFilter === 'Dividend' && item.divYield < 1.0) return false;
      return !q || `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(q);
    });
  }, [marketFilter, query, watchedSet]);

  if (!account) {
    const launchGuest = () => {
      const guest: InvestmentAccount = {
        name: 'Alex Morgan',
        email: 'alex.morgan@invemon.com',
        plan: 'Pro',
        goal: 'Long-term growth',
        risk: 'Balanced',
        monthlyAmount: '250',
        country: 'United States',
      };
      try { localStorage.setItem('invemon-account', JSON.stringify(guest)); } catch { /* Optional storage */ }
      onAccount?.(guest);
    };
    return (
      <div className="db-empty">
        <Wordmark />
        <h1>A clearer view of your future.</h1>
        <p>Explore a considered space for your investments, goals, and long-term plans. Start with an illustrative portfolio—no real money or brokerage account required.</p>
        <div className="db-empty-actions">
          <button className="button button-lime" onClick={onSignUp}>Create your account <Icon name="arrow" size={18} /></button>
          {onAccount && (
            <button className="button button-blue" onClick={launchGuest}>Explore guest portfolio</button>
          )}
        </div>
        <button className="db-btn ghost" onClick={onBack}>Back to website</button>
      </div>
    );
  }

  const firstName = account.name.split(' ')[0] || 'there';
  const changeText = (value: number, base: number) => (state.prefs.valueMode === 'percent' ? pct(base ? (value / base) * 100 : 0) : `${value >= 0 ? '+' : '−'}${M(Math.abs(value))}`);

  const submitTrade = (mode: TradeMode, symbol: string, dollars: number, goalId?: string, destination?: string, funding?: FundingRequest): string | null => {
    if (!Number.isFinite(dollars) || dollars < 1) return 'Enter an amount of at least $1.';
    if (mode === 'deposit' || mode === 'withdraw') {
      if (!funding) return 'Choose a funding method before continuing.';
      const failure = validateFunding(funding, mode, account.country || 'United States', assetOptions, dollars);
      if (failure) return failure;
      const receipt = fundingReceipt(funding);
      if (funding.kind === 'crypto') {
        const coin = FUNDING_COINS.find(c => c.symbol === funding.coin)!;
        const held = state.holdings.find(h => h.symbol === coin.symbol);
        const quantity = Number(funding.quantity);
        const price = held?.price || coin.price;
        let holdings: Holding[];
        if (mode === 'deposit') {
          holdings = held ? state.holdings.map(h => h.symbol === coin.symbol ? { ...h, units: h.units + quantity, cost: (h.units * h.cost + quantity * price) / (h.units + quantity) } : h)
            : [...state.holdings, { symbol: coin.symbol, name: coin.name, cls: 'Crypto', units: quantity, price, cost: price, day: 0, divYield: 0, sector: 'Digital asset' }];
        } else {
          if (!held || quantity > held.units) return `That quantity exceeds your available ${coin.symbol} holding.`;
          holdings = quantity === held.units ? state.holdings.filter(h => h.symbol !== coin.symbol) : state.holdings.map(h => h.symbol === coin.symbol ? { ...h, units: h.units - quantity } : h);
        }
        const activity: Activity = { ...makeActivity(mode, `${coin.symbol} ${mode === 'deposit' ? 'deposit' : 'withdrawal'} simulated`, `${quantity} ${coin.symbol} · ${funding.network} · ${receipt.sourceOrDestination} · USD value illustrative`, mode === 'deposit' ? dollars : -dollars), funding: receipt };
        setState({ ...state, holdings, activity: [activity, ...state.activity] });
        showToast(`Sample ${coin.symbol} holding updated; USD cash unchanged`);
        return null;
      }
      if (mode === 'withdraw' && dollars > state.cash) return 'That is more than your available cash.';
      const sign = mode === 'deposit' ? 1 : -1;
      const activity: Activity = { ...makeActivity(mode, mode === 'deposit' ? 'Bank deposit simulated' : 'Bank withdrawal simulated', `${receipt.method} · ${receipt.sourceOrDestination} · USD · no real funds moved`, sign * dollars), funding: receipt };
      setState(current => ({ ...current, cash: current.cash + sign * dollars, activity: [activity, ...current.activity] }));
      showToast('Sample bank transfer recorded');
      return null;
    }
    if (mode === 'swap') {
      if (!destination || destination === symbol) return 'Choose two different assets.';
      const source = state.holdings.find(h => h.symbol === symbol);
      const target = lookupQuote(destination, state.holdings, state.watchlist);
      if (!source || !Number.isFinite(source.price) || source.price <= 0) return 'Choose an available holding to swap.';
      if (!target || !Number.isFinite(target.price) || target.price <= 0) return 'The destination asset is unavailable.';
      if (dollars > source.units * source.price) return 'The swap exceeds your available position value.';
      const sold = applySell(state, symbol, dollars);
      if ('error' in sold) return sold.error;
      const bought = applyBuy(sold.next, destination, dollars);
      if ('error' in bought) return bought.error;
      setState({ ...bought.next, cash: state.cash, activity: [makeActivity('swap', `Swapped ${symbol} → ${destination}`, `${(dollars / source.price).toFixed(6)} ${symbol} → ${(dollars / target.price).toFixed(6)} ${destination} · ${money(dollars)} · sample exchange`, 0), ...state.activity] });
      showToast(`Swapped ${symbol} for ${destination} in your sample portfolio`);
      return null;
    }
    if (mode === 'goal') {
      const goal = state.goals.find(item => item.id === goalId);
      if (!goal) return 'Choose a savings goal.';
      if (dollars > total - state.goals.reduce((sum, item) => sum + item.saved, 0) + 0.001) return 'That amount exceeds the unassigned value in your portfolio. Goals are earmarks, not separate accounts.';
      setState(current => ({
        ...current,
        goals: current.goals.map(item => (item.id === goal.id ? { ...item, saved: item.saved + dollars } : item)),
        activity: [makeActivity('invest', `Added to ${goal.name}`, 'Portfolio earmark only · cash and total wealth unchanged', 0), ...current.activity],
      }));
      showToast(`${money(dollars)} added to ${goal.name}`);
      return null;
    }
    if (mode === 'sell') {
      const result = applySell(state, symbol, dollars);
      if ('error' in result) return result.error;
      setState(result.next);
      showToast(`Sold ${symbol} for ${money(dollars)} in your sample portfolio`);
      return null;
    }
    const result = applyBuy(state, symbol, dollars);
    if ('error' in result) return result.error;
    setState(result.next);
    showToast(`Bought ${symbol} for ${money(dollars)} in your sample portfolio`);
    return null;
  };

  const applySampleRebalance = () => {
    if (total <= 0) return;
    const representative: Record<AssetClass, { symbol: string; name: string; price: number; day: number; divYield: number; sector: string }> = {
      Stocks: { symbol: 'AAPL', name: 'Apple Inc.', price: 195.25, day: 1.82, divYield: 0.51, sector: 'Consumer Tech' },
      ETFs: { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', price: 272.4, day: 0.42, divYield: 1.38, sector: 'Broad US Equity' },
      Bonds: { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', price: 73.2, day: -0.18, divYield: 4.18, sector: 'Investment Grade Bonds' },
      Crypto: { symbol: 'BTC', name: 'Bitcoin', price: 64420, day: 3.05, divYield: 0, sector: 'Digital Layer-1' },
    };

    let updatedHoldings = [...state.holdings];
    CLASSES.forEach(cls => {
      const targetVal = (TARGET[cls] / 100) * total;
      const classRows = updatedHoldings.filter(h => h.cls === cls);
      const currentVal = classRows.reduce((sum, h) => sum + h.units * h.price, 0);
      if (classRows.length > 0 && currentVal > 0) {
        const ratio = targetVal / currentVal;
        updatedHoldings = updatedHoldings.map(h => (h.cls === cls ? { ...h, units: h.units * ratio, cost: ratio > 1 ? (h.units * h.cost + h.units * (ratio - 1) * h.price) / (h.units * ratio) : h.cost } : h));
      } else if (targetVal > 0) {
        const rep = representative[cls];
        updatedHoldings.push({
          symbol: rep.symbol,
          name: rep.name,
          cls,
          units: targetVal / rep.price,
          cost: rep.price,
          price: rep.price,
          day: rep.day,
          divYield: rep.divYield,
          sector: rep.sector,
        });
      }
    });
    const nextCash = (TARGET.Cash / 100) * total;
    setState(current => ({
      ...current,
      cash: nextCash,
      holdings: updatedHoldings,
      rebalanceQueued: false,
      activity: [makeActivity('rebalance', 'Portfolio rebalanced to target weights', `${account?.risk || 'Balanced'} policy · sample rebalance; no live orders`, 0), ...current.activity],
    }));
    setRebalanceOpen(false);
    showToast('Portfolio aligned to 100/100 target allocation');
  };

  const simulateCashInterest = () => {
    const payout = Math.round(monthlyCashInterest * 100) / 100;
    if (payout <= 0) { showToast('No sample interest to credit at this balance.'); return; }
    setState(current => ({
      ...current,
      cash: current.cash + payout,
      activity: [makeActivity('dividend', 'High-Yield Cash interest credited', `${CASH_APY}% illustrative APY · equivalent monthly compounding · simulation only`, payout), ...current.activity],
    }));
    showToast(`${money(payout)} monthly interest credited to cash`);
  };

  const simulateDividendPayout = (h: Holding) => {
    const yld = h.divYield ?? lookupQuote(h.symbol, state.holdings, state.watchlist)?.divYield ?? 1.2;
    const quarterly = Math.max(1, Math.round(((holdingValue(h) * (yld / 100)) / 4) * 100) / 100);
    if (state.prefs.drip) {
      const addedUnits = quarterly / h.price;
      setState(current => ({
        ...current,
        holdings: current.holdings.map(item => (item.symbol === h.symbol ? { ...item, units: item.units + addedUnits } : item)),
        activity: [makeActivity('dividend', `DRIP reinvested ${h.symbol}`, `+${addedUnits.toFixed(5)} units from dividend`, quarterly), ...current.activity],
      }));
      showToast(`${money(quarterly)} ${h.symbol} dividend reinvested via DRIP`);
    } else {
      setState(current => ({
        ...current,
        cash: current.cash + quarterly,
        activity: [makeActivity('dividend', `Dividend paid · ${h.symbol}`, 'Credited to cash sweep', quarterly), ...current.activity],
      }));
      showToast(`${money(quarterly)} ${h.symbol} dividend added to cash`);
    }
  };

  const togglePlan = (id: string) => setState(s => ({ ...s, plans: s.plans.map(p => (p.id === id ? { ...p, active: !p.active } : p)) }));
  const setPlanAmount = (id: string, value: string) => setState(s => ({ ...s, plans: s.plans.map(p => (p.id === id ? { ...p, amount: Math.max(0, Number(value) || 0) } : p)) }));
  const removePlan = (id: string) => { if (window.confirm('Remove this simulated recurring plan?')) setState(s => ({ ...s, plans: s.plans.filter(p => p.id !== id) })); };
  const runPlan = (plan: Plan) => {
    if (plan.amount < 1) { showToast('Set a contribution of at least $1 first.'); return; }
    const result = applyBuy(state, plan.symbol, plan.amount, 'auto', plan.name);
    if ('error' in result) { showToast(result.error); return; }
    const days = plan.frequency === 'Weekly' ? 7 : plan.frequency === 'Bi-weekly' ? 14 : 30;
    setState({ ...result.next, plans: result.next.plans.map(p => (p.id === plan.id ? { ...p, nextRun: isoInDays(days) } : p)) });
    showToast(`${plan.name}: ${money(plan.amount)} invested in sample data`);
  };

  const createPlan = () => {
    if (!planDraft) return;
    const amt = Number(planDraft.amount);
    if (!planDraft.name.trim() || !(amt >= 1)) {
      showToast('Enter a plan name and amount of at least $1.');
      return;
    }
    const days = planDraft.frequency === 'Weekly' ? 7 : planDraft.frequency === 'Bi-weekly' ? 14 : 30;
    setState(current => ({
      ...current,
      plans: [
        ...current.plans,
        { id: uid(), name: planDraft.name.trim(), symbol: planDraft.symbol, amount: amt, frequency: planDraft.frequency, active: true, nextRun: isoInDays(days) },
      ],
    }));
    setPlanDraft(null);
    showToast('Recurring auto-invest plan created');
  };

  const openNotification = (notice: HeaderNotice) => {
    setState(current => ({ ...current, readNotificationIds: [...new Set([...current.readNotificationIds, notice.id])] }));
    navigateDashboard(notice.section);
    if (notice.task === 'deposit') setTrade({ mode: 'deposit' });
  };
  const markNotificationsRead = () => setState(current => ({ ...current, readNotificationIds: [...new Set([...current.readNotificationIds, ...dashboardNotifications.map(item => item.id)])] }));
  const runNextPlan = () => { if (nextPlan) runPlan(nextPlan); else navigateDashboard('autoinvest'); };

  const toggleStockWatch = (quote: Quote) => {
    const exists = state.watchlist.some(w => w.symbol === quote.symbol);
    if (exists) {
      setState(s => ({ ...s, watchlist: s.watchlist.filter(w => w.symbol !== quote.symbol) }));
      showToast(`${quote.symbol} removed from watchlist`);
    } else {
      setState(s => ({ ...s, watchlist: [...s.watchlist, { ...quote, spark: makeSpark(quote.price, quote.symbol.length * 13 + 7) }] }));
      showToast(`${quote.symbol} added to watchlist`);
    }
  };

  const savePriceAlert = (alert: PriceAlert) => {
    setState(current => ({
      ...current,
      priceAlerts: [...current.priceAlerts.filter(a => a.symbol !== alert.symbol), alert],
    }));
    showToast(`Price reminder set for ${alert.symbol} ${alert.direction} ${money(alert.targetPrice)}`);
  };

  const removePriceAlert = (symbol: string) => {
    setState(current => ({ ...current, priceAlerts: current.priceAlerts.filter(a => a.symbol !== symbol) }));
    showToast(`Price reminder cleared for ${symbol}`);
  };

  const toggleCryptoFavorite = (id: string) => {
    const exists = cryptoFavorites.includes(id);
    setCryptoFavorites(current => (exists ? current.filter(item => item !== id) : [...current, id]));
    showToast(exists ? 'Removed from your crypto watchlist' : 'Added to your crypto watchlist');
  };
  const openCrypto = (nextView: CryptoView = 'all') => { setCryptoView(nextView); navigateDashboard('crypto'); };

  const addGoal = () => {
    if (!goalDraft) return;
    const target = Number(goalDraft.target);
    const years = Number(goalDraft.years);
    const monthly = Number(goalDraft.monthly);
    if (!goalDraft.name.trim() || !(target > 0) || !(years >= 1) || !(monthly >= 0)) {
      showToast('Complete every goal field to continue.');
      return;
    }
    setState(s => ({ ...s, goals: [...s.goals, { id: uid(), name: goalDraft.name.trim(), target, saved: 0, dueYear: new Date().getFullYear() + years, monthly }] }));
    setGoalDraft(null);
    showToast('Goal created');
  };
  const removeGoal = (id: string) => { if (window.confirm('Remove this goal earmark? Portfolio assets and cash will not change.')) setState(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) })); };
  const setGoalMonthly = (id: string, value: string) => setState(s => ({ ...s, goals: s.goals.map(g => (g.id === id ? { ...g, monthly: Math.max(0, Number(value) || 0) } : g)) }));

  const setPref = (patch: Partial<Prefs>) => setState(s => ({ ...s, prefs: { ...s.prefs, ...patch } }));
  const toggleClass = (cls: string) => setCollapsed(c => ({ ...c, [cls]: !c[cls] }));

  const sortedHoldings = [...state.holdings].sort((a, b) => {
    if (sortBy === 'name') return a.symbol.localeCompare(b.symbol);
    if (sortBy === 'return') return (b.price - b.cost) / b.cost - (a.price - a.cost) / a.cost;
    return holdingValue(b) - holdingValue(a);
  });

  const visibleHoldings = sortedHoldings.filter(h => !query.trim() || `${h.symbol} ${h.name} ${h.cls}`.toLowerCase().includes(query.trim().toLowerCase()));

  const visibleActivity = state.activity.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'invest') return a.kind === 'invest' || a.kind === 'sell' || a.kind === 'auto' || a.kind === 'swap' || a.kind === 'rebalance';
    if (filter === 'cash') return a.kind === 'deposit' || a.kind === 'withdraw';
    return a.kind === 'dividend';
  });

  const allocationParts = allocation.map(a => ({ key: a.key, pct: a.weight, color: CLASS_COLORS[a.key] }));

  const sectionHero = (() => {
    const cryptoHoldings = state.holdings.filter(holding => holding.cls === 'Crypto');
    const cryptoValue = cryptoHoldings.reduce((sum, holding) => sum + holdingValue(holding), 0);
    const watchedValue = state.watchlist.reduce((sum, item) => sum + (state.holdings.find(holding => holding.symbol === item.symbol) ? holdingValue(state.holdings.find(holding => holding.symbol === item.symbol)!) : 0), 0);
    const activePlans = state.plans.filter(plan => plan.active).length;
    const onTrackGoals = state.goals.filter(goal => goalMath(goal).onTrack).length;
    const goalSavings = state.goals.reduce((sum, goal) => sum + goal.saved, 0);
    const goalTargets = state.goals.reduce((sum, goal) => sum + goal.target, 0);
    const today = new Date();
    const currentMonthActivity = state.activity.filter(item => {
      const date = new Date(item.date);
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    });
    const investmentThisMonth = currentMonthActivity.filter(item => ['invest', 'auto'].includes(item.kind)).reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const saleThisMonth = currentMonthActivity.filter(item => item.kind === 'sell').reduce((sum, item) => sum + item.amount, 0);
    switch (section) {
      case 'overview':
        return {
          eyebrow: 'TOTAL NET WORTH',
          value: M(total),
          description: `${state.holdings.length} invested positions + available cash`,
          pills: [
            { label: `${dayChange >= 0 ? '▲' : '▼'} ${changeText(dayChange, total - dayChange)} today`, tone: dayChange >= 0 ? 'up' : 'down' },
            { label: `${CASH_APY}% cash APY`, tone: 'neutral' },
          ],
          metrics: [
            { label: 'Invested assets', value: M(invested), note: `${state.holdings.length} positions` },
            { label: 'Total return', value: changeText(gain, costBasis), note: `${pct(gainPct)} all-time`, tone: gain >= 0 ? 'positive' : 'negative' },
            { label: 'Cash buying power', value: M(state.cash), note: `+${M(monthlyCashInterest)}/mo yield` },
            { label: '1Y vs S&P 500', value: pct(yearReturn - yearBench), note: `Health ${healthScore}/100`, tone: 'positive' },
          ],
        };
      case 'portfolio':
        return {
          eyebrow: 'INVESTED PORTFOLIO',
          value: M(invested),
          description: `Market value across ${state.holdings.length} diversified positions`,
          pills: [
            { label: `${changeText(gain, costBasis)} unrealized`, tone: gain >= 0 ? 'up' : 'down' },
            { label: `${pct(gainPct)} on cost basis`, tone: 'neutral' },
          ],
          metrics: [
            { label: 'Cost basis', value: M(costBasis), note: 'Capital invested' },
            { label: 'Positions', value: String(state.holdings.length), note: `${new Set(state.holdings.map(holding => holding.cls)).size} asset classes` },
            { label: 'Crypto exposure', value: M(cryptoValue), note: total ? `${((cryptoValue / total) * 100).toFixed(1)}% of net worth` : '0.0%' },
            { label: 'Available cash', value: M(state.cash), note: 'Buying power' },
          ],
        };
      case 'markets':
        return {
          eyebrow: 'MARKET WATCHLIST',
          value: `${state.watchlist.length} ${state.watchlist.length === 1 ? 'asset' : 'assets'}`,
          description: 'Your tracked stocks, funds, and fixed-income ideas',
          pills: [
            { label: `${MARKET_UNIVERSE.length} screening candidates`, tone: 'neutral' },
            { label: `${MARKET_UNIVERSE.filter(asset => asset.divYield >= 1).length} dividend payers`, tone: 'up' },
          ],
          metrics: [
            { label: 'Watchlist value', value: M(watchedValue), note: 'Assets you currently hold' },
            { label: 'Market candidates', value: String(MARKET_UNIVERSE.length), note: 'Stocks, ETFs & bonds' },
            { label: 'Dividend ideas', value: String(MARKET_UNIVERSE.filter(asset => asset.divYield >= 1).length), note: 'Yield above 1%' },
            { label: 'Saved crypto', value: String(cryptoFavorites.length), note: 'CoinPaprika favorites' },
          ],
        };
      case 'crypto':
        return {
          eyebrow: 'DIGITAL-ASSET WATCHLIST',
          value: `${cryptoFavorites.length} ${cryptoFavorites.length === 1 ? 'saved asset' : 'saved assets'}`,
          description: 'CoinPaprika directory, quotes, and historical market data',
          pills: [
            { label: `${cryptoHoldings.length} crypto positions`, tone: 'neutral' },
            { label: `Exposure ${M(cryptoValue)}`, tone: cryptoValue ? 'up' : 'neutral' },
          ],
          metrics: [
            { label: 'Crypto exposure', value: M(cryptoValue), note: total ? `${((cryptoValue / total) * 100).toFixed(1)}% of net worth` : '0.0%' },
            { label: 'Crypto positions', value: String(cryptoHoldings.length), note: 'In your portfolio' },
            { label: 'Saved assets', value: String(cryptoFavorites.length), note: 'In your watchlist' },
            { label: 'Market source', value: 'CoinPaprika', note: 'Quotes may be delayed' },
          ],
        };
      case 'yield':
        return {
          eyebrow: 'ESTIMATED PASSIVE INCOME',
          value: M(annualPassiveIncome),
          description: 'Illustrative annual dividends and cash-sweep yield',
          pills: [
            { label: `${CASH_APY}% cash-sweep APY`, tone: 'up' },
            { label: `DRIP ${state.prefs.drip ? 'enabled' : 'paused'}`, tone: 'neutral' },
          ],
          metrics: [
            { label: 'Est. dividend income', value: `${M(annualDividendIncome)}/yr`, note: `${dividendHoldings.length} dividend holdings` },
            { label: 'Est. cash-sweep yield', value: `${M(annualCashInterest)}/yr`, note: 'On current cash balance' },
            { label: 'Monthly passive income', value: `${M(annualPassiveIncome / 12)}/mo`, note: 'Illustrative run-rate' },
            { label: 'Portfolio yield', value: `${total ? ((annualPassiveIncome / total) * 100).toFixed(2) : '0.00'}%`, note: 'Estimated annualized' },
          ],
        };
      case 'autoinvest':
        return {
          eyebrow: 'RECURRING INVESTMENT PLAN',
          value: `${M(monthlyPlan)}/mo`,
          description: `${state.plans.filter(plan => plan.active).length} active dollar-cost-averaging schedules`,
          pills: [
            { label: `${M(monthlyPlan * 12)} annualized contributions`, tone: 'neutral' },
            { label: `${nextPlan?.frequency || 'Monthly'} cadence`, tone: 'up' },
          ],
          metrics: [
            { label: 'Active plans', value: String(activePlans), note: `${state.plans.length} total schedules` },
            { label: 'Next contribution', value: nextPlan ? fmtWhen(nextPlan.nextRun) : 'Not scheduled', note: nextPlan?.name || 'Create a DCA plan' },
            { label: '10-year illustration', value: M(estimatedInTenYears), note: 'Assumes a fixed 7% return' },
            { label: 'Available cash', value: M(state.cash), note: `${CASH_APY}% sweep APY` },
          ],
        };
      case 'goals':
        return {
          eyebrow: 'GOALS-BASED WEALTH PLAN',
          value: `${onTrackGoals} of ${state.goals.length} on track`,
          description: `${M(goalSavings)} saved toward ${M(goalTargets)} in combined financial goals`,
          pills: [
            { label: `${M(monthlyPlan)}/mo auto-invest`, tone: 'up' },
            { label: `${Math.max(0, goalTargets - goalSavings) > 0 ? M(goalTargets - goalSavings) + ' remaining' : 'Goals fully funded'}`, tone: 'neutral' },
          ],
          metrics: [
            { label: 'Goals on track', value: `${onTrackGoals}/${state.goals.length}`, note: 'At your current savings pace' },
            { label: 'Total target', value: M(goalTargets), note: `${state.goals.length} active goals` },
            { label: 'Total saved', value: M(goalSavings), note: `${goalTargets ? ((goalSavings / goalTargets) * 100).toFixed(0) : 0}% funded` },
            { label: 'Monthly contributions', value: M(state.goals.reduce((sum, goal) => sum + goal.monthly, 0)), note: 'Across all goals' },
          ],
        };
      case 'activity': {
        const latest = state.activity[0];
        return {
          eyebrow: 'YOUR INVESTMENT LEDGER',
          value: `${state.activity.length} entries`,
          description: 'A running record of sample buys, sales, dividends, and deposits',
          pills: [
            { label: `${currentMonthActivity.length} transactions this month`, tone: 'neutral' },
            { label: latest ? `Last: ${latest.title}` : 'No recent transactions', tone: 'up' },
          ],
          metrics: [
            { label: 'Buys & DCA', value: M(investmentThisMonth), note: 'This month' },
            { label: 'Sale proceeds', value: M(saleThisMonth), note: 'This month' },
            { label: 'Income received', value: M(currentMonthActivity.filter(item => item.kind === 'dividend').reduce((sum, item) => sum + item.amount, 0)), note: 'Dividends & interest' },
            { label: 'Cash balance', value: M(state.cash), note: 'Current buying power' },
          ],
        };
      }
      case 'insights':
        return {
          eyebrow: 'PORTFOLIO HEALTH CHECK',
          value: `${healthScore} / 100`,
          description: drift.length ? `${drift.length} asset classes need a portfolio review` : 'Allocation remains inside your target risk bands',
          pills: [
            { label: `${drift.length} allocation drifts`, tone: drift.length ? 'down' : 'up' },
            { label: `Risk profile: ${riskLabel}`, tone: 'neutral' },
          ],
          metrics: [
            { label: 'Largest position', value: topHolding?.symbol || '—', note: `${topWeight.toFixed(1)}% of net worth` },
            { label: 'Potential tax losses', value: M(losers.reduce((sum, h) => sum + Math.max(0, h.cost - h.price) * h.units, 0)), note: `${losers.length} unrealized loss positions` },
            { label: 'Allocation deviations', value: String(drift.length), note: 'Greater than 5% from target' },
            { label: 'Cash reserve', value: total ? `${((state.cash / total) * 100).toFixed(1)}%` : '0%', note: `${CASH_APY}% sweep APY` },
          ],
        };
      case 'settings':
        return {
          eyebrow: 'INVESTOR ACCOUNT & PREFERENCES',
          value: `${account.plan} Plan`,
          description: `${account.name} · ${account.country || 'Account region not set'}`,
          pills: [
            { label: `${riskLabel} risk profile`, tone: 'neutral' },
            { label: `Goal: ${account.goal || 'Long-term growth'}`, tone: 'up' },
          ],
          metrics: [
            { label: 'Monthly investment', value: `${M(Number(account.monthlyAmount) || 0)}/mo`, note: 'Selected at account opening' },
            { label: 'Display preference', value: state.prefs.valueMode === 'value' ? 'Dollar amounts' : 'Percent returns', note: 'Applies across dashboard' },
            { label: 'Balance privacy', value: state.prefs.hideBalances ? 'Masked' : 'Visible', note: 'Personal display setting' },
            { label: 'DRIP preferences', value: state.prefs.drip ? 'Reinvest' : 'Cash payouts', note: 'Dividend handling' },
          ],
        };
    }
  })();

  const summaryHero = (
    <section className={`db-wealth-hero db-hero-${section}`} role="region" aria-label={`${sectionHero.eyebrow} summary`}>
      <div className="db-wealth-hero-top">
        <div className="db-wealth-primary">
          <span className="db-wealth-eyebrow">
            {sectionHero.eyebrow} <em className="db-simulation-note">Sample Portfolio</em>
          </span>
          <strong>{state.prefs.hideBalances && /^\$/.test(sectionHero.value) ? '••••••' : sectionHero.value}</strong>
          <span className="db-wealth-description">{sectionHero.description}</span>
          <div className="db-wealth-pills">
            {sectionHero.pills.map(pill => <span key={pill.label} className={`db-hero-pill ${pill.tone || 'neutral'}`}>{pill.label}</span>)}
          </div>
        </div>

        <div className="db-wealth-metrics">
          {sectionHero.metrics.map(metric => <div key={metric.label} className={metric.tone === 'positive' ? 'db-pos' : metric.tone === 'negative' ? 'db-neg' : ''}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </div>)}
        </div>

        <div className="db-wealth-actions">
          <button type="button" className="button button-lime" onClick={() => openTrade('invest')}>
            Buy / Sell
          </button>
          <button type="button" className="button button-blue" onClick={() => openTrade('deposit')}>
            Deposit
          </button>
          <button type="button" className="db-hero-ghost" onClick={() => setRebalanceOpen(true)}>
            <Icon name="sliders" size={16} /> Rebalance
          </button>
        </div>
      </div>

      <div className="db-wealth-bar-wrap" aria-label="Wealth allocation bar">
        <div className="db-wealth-bar">
          {allocation.map(item => (
            <span
              key={item.key}
              style={{ width: `${Math.max(item.weight, 1.5)}%`, background: CLASS_COLORS[item.key] }}
              title={`${item.key}: ${item.weight.toFixed(1)}% (${money(item.value)})`}
            />
          ))}
        </div>
        <div className="db-wealth-bar-legend">
          {allocation.map(item => (
            <span key={item.key}>
              <i style={{ background: CLASS_COLORS[item.key] }} />
              {item.key} <b>{item.weight.toFixed(0)}%</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  );

  const analyticsCard = (
    <section className="db-card db-portfolio-chart" aria-label="Portfolio analytics">
      <div className="db-portfolio-heading"><span><i /> YOUR PORTFOLIO</span><span className="db-demo-label">ILLUSTRATIVE · USD</span></div>
      <div className="db-portfolio-balance"><span>Total portfolio value</span><strong>{M(total)}</strong><div className={tone(gain)}><Icon name="trend" size={14} /> {changeText(gain, costBasis)} <span>({pct(gainPct)}) all-time return</span></div></div>
      <div className="db-card-head">
        <div className="db-seg" role="tablist" aria-label="Analytics mode">
          <button type="button" role="tab" aria-selected={chartView === 'performance'} className={chartView === 'performance' ? 'selected' : ''} onClick={() => setChartView('performance')}>
            Performance
          </button>
          <button type="button" role="tab" aria-selected={chartView === 'cashflow'} className={chartView === 'cashflow' ? 'selected' : ''} onClick={() => setChartView('cashflow')}>
            Contributions vs Growth
          </button>
          <button type="button" role="tab" aria-selected={chartView === 'income'} className={chartView === 'income' ? 'selected' : ''} onClick={() => setChartView('income')}>
            Passive Income
          </button>
        </div>
        {chartView === 'performance' && (
          <div className="db-seg" role="group" aria-label="Chart period">
            {RANGE_KEYS.map(item => (
              <button key={item} type="button" className={range === item ? 'selected' : ''} aria-pressed={range === item} onClick={() => setRange(item)}>
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
      {chartView === 'performance' && <PerformanceChart portfolio={series.portfolio} bench={series.bench} range={range} valueText={M} hideBalances={state.prefs.hideBalances} />}
      {chartView === 'cashflow' && <CashFlowBars monthlyPlan={monthlyPlan} gain={gain} valueText={M} />}
      {chartView === 'income' && <IncomeBars annualPassive={annualPassiveIncome} monthlyCashYield={monthlyCashInterest} valueText={M} />}
    </section>
  );

  const quickCard = (
    <section className="db-card db-editorial-quick" aria-label="Quick actions">
      <div className="db-card-head"><h2>Move with intention.</h2><Icon name="external" size={15} /></div>
      <div className="db-quick">
        <button type="button" onClick={() => openTrade('deposit')}><span className="db-quick-icon"><Icon name="plus" size={19} /></span>Add money</button>
        <button type="button" onClick={() => openTrade('withdraw')}><span className="db-quick-icon"><Icon name="arrow" size={19} /></span>Withdraw</button>
        <button type="button" onClick={() => openTrade('invest')}><span className="db-quick-icon"><Icon name="trend" size={19} /></span>Invest</button>
        <button type="button" onClick={() => openTrade('swap')}><span className="db-quick-icon"><Icon name="repeat" size={19} /></span>Swap</button>
        <button type="button" onClick={() => openTrade('sell')}><span className="db-quick-icon"><Icon name="chart" size={19} /></span>Sell</button>
      </div>
      <button className="db-recurring-link" onClick={() => navigateDashboard('autoinvest')}><span><Icon name="repeat" size={17} /><span>Small steps. Lasting habits.<small>{state.plans.filter(p => p.active).length} active recurring plans</small></span></span><Icon name="arrow" size={16} /></button>
    </section>
  );

  const portfolioOverview = (
    <section className="db-overview-stage" aria-label="Portfolio summary">
      {analyticsCard}
      <div className="db-cash-stack">
        <section className="db-cash-card" aria-label="Available cash">
          <div className="db-cash-card-top"><span>YOUR CASH ACCOUNT</span><Icon name="wallet" size={23} /></div>
          <div className="db-cash-card-balance"><span>Available to invest</span><strong>{M(state.cash)}</strong><small>USD · Sample buying power</small></div>
          <div className="db-cash-card-bottom"><span><i /> A little today. More possibility tomorrow.</span><Icon name="sprout" size={26} /></div>
        </section>
        {quickCard}
      </div>
    </section>
  );

  const focusCard = (
    <section className="db-card db-span-4 db-focus-card" aria-label="Suggested next step">
      <span className="db-focus-icon"><Icon name={nextStep.icon} size={20} /></span>
      <div className="db-focus-copy">
        <span className={`db-tag ${nextStep.level === 'warn' ? 'warn' : 'info'}`}>NEXT BEST ACTION</span>
        <h2>{nextStep.title}</h2>
        <p>{nextStep.body}</p>
      </div>
      <div className="db-focus-actions">
        {drift.length > 0 && (
          <button type="button" className="db-btn lime" onClick={() => setRebalanceOpen(true)}>
            1-Click Rebalance <Icon name="sliders" size={15} />
          </button>
        )}
        <button type="button" className="db-btn" onClick={() => openNotification(nextStep)}>
          {nextStep.action} <Icon name="arrow" size={15} />
        </button>
        {nextPlan && (
          <button type="button" className="db-focus-secondary" onClick={runNextPlan} disabled={!nextPlan.active}>
            Run {nextPlan.symbol} plan
          </button>
        )}
      </div>
    </section>
  );

  const overview = (
    <>
      {state.prefs.dailySummary && dayPct <= -1 && (
        <div className="db-banner" role="status">
          <strong>Markets are down today.</strong> Your portfolio is {pct(dayPct)} today. Your allocation is built for the long term, so no impulsive action is needed.
        </div>
      )}
      <div className="db-grid">
        <div className="db-overview-section-title db-span-4"><div><span>THE BIGGER PICTURE</span><h2>Built around <em>your ambitions.</em></h2></div><button className="db-btn ghost" onClick={() => navigateDashboard('insights')}>Portfolio insights <Icon name="arrow" size={15} /></button></div>
        <section className="db-card db-summary-kpi"><div className="db-kpi"><span>Monthly auto-invest</span><strong>{M(monthlyPlan)}</strong><small>{state.plans.filter(p => p.active).length} active recurring plans</small></div></section>
        <section className="db-card db-summary-kpi"><div className="db-kpi"><span>Annual passive income</span><strong className="db-pos">{M(annualPassiveIncome)}</strong><small>{M(annualDividendIncome)} div + {M(annualCashInterest)} cash APY</small></div></section>
        <section className="db-card db-summary-kpi"><div className="db-kpi"><span>Goals on track</span><strong>{state.goals.filter(g => goalMath(g).onTrack).length} of {state.goals.length}</strong><small>Projected from monthly pace</small></div></section>
        <section className="db-card db-summary-kpi"><div className="db-kpi"><span>Allocation health</span><strong>{healthScore}/100</strong><small>{drift.length ? `${drift.length} classes off target` : 'Balanced to target'}</small></div></section>

        <section className="db-card db-span-2">
          <div className="db-card-head">
            <h2>Asset allocation</h2>
            <div className="db-btn-row" style={{ marginTop: 0 }}>
              <span className={`db-tag ${drift.length ? 'warn' : ''}`}>{drift.length ? `${drift.length} off target` : 'On target'}</span>
              <button type="button" className="db-btn ghost" onClick={() => setRebalanceOpen(true)}>Rebalance</button>
            </div>
          </div>
          <div className="db-donut-wrap">
            <Donut parts={allocationParts} />
            <ul className="db-legend">
              {allocation.map(a => (
                <li key={a.key}>
                  <span className="db-dot" style={{ background: CLASS_COLORS[a.key] }} />
                  <span>{a.key}</span>
                  <span className="db-num">{a.weight.toFixed(1)}% <small className="db-muted">target {a.target}%</small></span>
                  <span className="db-bar" aria-hidden="true"><span style={{ width: `${clamp(a.weight, 0, 100)}%` }} /><i style={{ left: `${clamp(a.target, 0, 100)}%` }} /></span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="db-card db-span-2">
          <div className="db-card-head">
            <h2>Top holdings</h2>
            <button type="button" className="db-btn ghost" onClick={() => navigateDashboard('portfolio')}>Full portfolio</button>
          </div>
          <ul className="db-list">
            {sortedHoldings.slice(0, 4).map(h => {
              const ret = ((h.price - h.cost) / h.cost) * 100;
              return (
                <li key={h.symbol}>
                  <button type="button" className="db-asset-link" onClick={() => setInspectedSymbol(h.symbol)}>
                    <span className={`db-holding-monogram db-symbol-${h.symbol.toLowerCase()}`} aria-hidden="true">{h.symbol === 'AAPL' ? 'a' : h.symbol === 'BTC' ? '₿' : h.symbol.slice(0, 1)}</span><span><strong>{h.symbol}</strong>
                    <small>{h.name} · {h.units.toLocaleString('en-US', { maximumFractionDigits: 3 })} units</small></span>
                  </button>
                  <div className="db-num">
                    <strong>{M(holdingValue(h))}</strong>
                    <small className={tone(ret)}>{pct(ret)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="db-card db-span-2">
          <div className="db-card-head">
            <h2>Wealth goals</h2>
            <div className="db-btn-row" style={{ marginTop: 0 }}>
              <button type="button" className="db-btn ghost" onClick={() => openTrade('goal', undefined, state.goals[0]?.id)} disabled={!state.goals.length}>Contribute</button>
              <button type="button" className="db-btn ghost" onClick={() => navigateDashboard('goals')}>Manage</button>
            </div>
          </div>
          <ul className="db-list">
            {state.goals.slice(0, 3).map(goal => {
              const math = goalMath(goal);
              return (
                <li key={goal.id} style={{ display: 'block' }}>
                  <div className="db-row-between"><strong>{goal.name}</strong><span className={`db-tag ${math.onTrack ? '' : 'warn'}`}>{math.onTrack ? 'On track' : 'Needs a boost'}</span></div>
                  <div className="db-progress" aria-hidden="true"><span style={{ width: `${math.pct}%` }} /></div>
                  <small>{M(goal.saved)} of {M(goal.target)} · target {goal.dueYear}</small>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="db-card db-span-2">
          <div className="db-card-head">
            <h2>Market watchlist</h2>
            <button type="button" className="db-btn ghost" onClick={() => navigateDashboard('markets')}>Screener</button>
          </div>
          <ul className="db-list">
            {state.watchlist.slice(0, 4).map(item => (
              <li key={item.symbol}>
                <button type="button" className="db-asset-link" onClick={() => setInspectedSymbol(item.symbol)}>
                  <strong>{item.symbol}</strong>
                  <small>{item.name}</small>
                </button>
                <Spark data={item.spark} />
                <div className="db-num">{M(item.price)}<small className={tone(item.day)}>{pct(item.day)}</small></div>
              </li>
            ))}
          </ul>
          <button type="button" className="crypto-overview-link" onClick={() => openCrypto('watchlist')}>
            <span>Live CoinPaprika crypto watchlist <strong>({cryptoFavorites.length})</strong></span>
            <Icon name="arrow" size={16} />
          </button>
        </section>

        {focusCard}
        <section className="db-card db-span-4">
          <div className="db-card-head"><h2>Recent activity</h2><button type="button" className="db-btn ghost" onClick={() => navigateDashboard('activity')}>View ledger</button></div>
          <ul className="db-list">
            {state.activity.slice(0, 5).map(item => (
              <li key={item.id}>
                <div><strong>{item.title}</strong><small>{item.detail} · {fmtWhen(item.date)}</small></div>
                <span className={`db-num ${item.amount < 0 ? '' : item.amount > 0 ? 'db-pos' : 'db-muted'}`}>
                  {item.amount === 0 ? (item.kind === 'swap' ? 'Exchanged' : 'Completed') : `${item.amount > 0 ? '+' : '−'}${M(Math.abs(item.amount))}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );

  const portfolio = (
    <div className="db-grid">
      <section className="db-card db-span-4">
        <div className="db-card-head">
          <div>
            <h2>Holdings by asset class</h2>
            <span className="db-small db-muted">Click any symbol to inspect 52-week range, position weight, and set price alerts.</span>
          </div>
          <div className="db-toolbar-inline">
            <label className="db-inline-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter holdings..." aria-label="Search holdings" />
            </label>
            <div className="db-seg" role="group" aria-label="Sort holdings">
              {(['value', 'return', 'name'] as const).map(item => (
                <button key={item} type="button" className={sortBy === item ? 'selected' : ''} aria-pressed={sortBy === item} onClick={() => setSortBy(item)}>
                  {item === 'value' ? 'Value' : item === 'return' ? 'Return' : 'Name'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {CLASSES.map(cls => {
          const rows = visibleHoldings.filter(h => h.cls === cls);
          const value = classValue(cls);
          const weight = total ? (value / total) * 100 : 0;
          const open = !collapsed[cls];
          return (
            <div className="db-class-group" key={cls}>
              <button type="button" className="db-class-head" aria-expanded={open} onClick={() => toggleClass(cls)}>
                <span><strong>{cls}</strong><small>{weight.toFixed(1)}% of portfolio · target {TARGET[cls]}%</small></span>
                <span className="db-num">{M(value)} <Icon name={open ? 'minus' : 'plus'} size={16} /></span>
              </button>
              {open && (
                <div className="db-table-wrap">
                  <table className="db-table">
                    <thead>
                      <tr><th>Asset</th><th className="num">Units</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">Return</th><th className="num">Today</th><th className="num">Action</th></tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={8} className="db-muted">{query ? `No ${cls.toLowerCase()} holdings match "${query}".` : `No ${cls.toLowerCase()} holdings yet.`}</td></tr>}
                      {rows.map(h => {
                        const ret = ((h.price - h.cost) / h.cost) * 100;
                        const hasAlert = state.priceAlerts.some(a => a.symbol === h.symbol);
                        return (
                          <tr key={h.symbol}>
                            <td>
                              <button type="button" className="db-asset-link" onClick={() => setInspectedSymbol(h.symbol)}>
                                <strong>{h.symbol} {hasAlert && <em className="db-alert-dot" title="Price alert active">●</em>}</strong>
                                <small>{h.name}</small>
                              </button>
                            </td>
                            <td className="num">{h.units.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                            <td className="num">{M(h.cost)}</td>
                            <td className="num">{M(h.price)}</td>
                            <td className="num">{M(holdingValue(h))}</td>
                            <td className={`num ${tone(ret)}`}>{pct(ret)}</td>
                            <td className={`num ${tone(h.day)}`}>{pct(h.day)}</td>
                            <td className="num">
                              <span className="db-row-actions">
                                <button type="button" className="db-row-action" onClick={() => openTrade('invest', h.symbol)}>Buy</button>
                                <button type="button" className="db-row-action" onClick={() => openTrade('sell', h.symbol)}>Sell</button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );

  const markets = (
    <div className="db-grid">
      <section className="crypto-shortcut db-span-4">
        <div>
          <span className="crypto-kicker">LIVE CRYPTOCURRENCY DIRECTORY</span>
          <h2>Explore 11,000+ digital assets</h2>
          <p>Browse live CoinPaprika market caps, 24h volumes, historical charts, and manage your crypto watchlist.</p>
        </div>
        <button type="button" className="crypto-primary" onClick={() => openCrypto()}>
          Open Crypto Explorer <Icon name="arrow" size={17} />
        </button>
      </section>

      <section className="db-card db-span-4">
        <div className="db-card-head">
          <div>
            <h2>Stocks, ETFs &amp; Bonds Screener</h2>
            <span className="db-small db-muted">Click any asset to inspect 52-week range, set price alerts, or place sample orders.</span>
          </div>
          <div className="db-toolbar-inline">
            <label className="db-inline-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search symbol, name, sector..." aria-label="Search markets" />
            </label>
          </div>
        </div>

        <div className="db-seg" role="group" aria-label="Filter market category" style={{ marginBottom: 16 }}>
          {([
            ['all', 'All Assets'],
            ['Stocks', 'Stocks'],
            ['ETFs', 'ETFs'],
            ['Dividend', 'Dividend Payers'],
            ['Bonds', 'Bonds'],
            ['watchlist', `Watchlist (${state.watchlist.length})`],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={marketFilter === id ? 'selected' : ''} aria-pressed={marketFilter === id} onClick={() => setMarketFilter(id as MarketFilter)}>
              {label}
            </button>
          ))}
        </div>

        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                <th>Watch</th>
                <th>Asset</th>
                <th>Sector</th>
                <th>Trend</th>
                <th className="num">Div Yield</th>
                <th className="num">Price</th>
                <th className="num">Today</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {screenerRows.length === 0 && (
                <tr><td colSpan={8} className="db-muted">No market listings match your current filter.</td></tr>
              )}
              {screenerRows.map((item, idx) => {
                const isWatched = watchedSet.has(item.symbol);
                const spark = state.watchlist.find(w => w.symbol === item.symbol)?.spark ?? makeSpark(item.price, idx * 19 + 5);
                const isHeld = state.holdings.some(h => h.symbol === item.symbol);
                return (
                  <tr key={item.symbol}>
                    <td>
                      <button
                        type="button"
                        className={`crypto-star ${isWatched ? 'is-saved' : ''}`}
                        aria-label={`${isWatched ? 'Remove' : 'Add'} ${item.symbol} ${isWatched ? 'from' : 'to'} watchlist`}
                        aria-pressed={isWatched}
                        onClick={() => toggleStockWatch(item)}
                      >
                        <Icon name="star" size={17} />
                      </button>
                    </td>
                    <td>
                      <button type="button" className="db-asset-link" onClick={() => setInspectedSymbol(item.symbol)}>
                        <strong>{item.symbol}</strong>
                        <small>{item.name}</small>
                      </button>
                    </td>
                    <td><span className="db-tag info">{item.sector}</span></td>
                    <td><Spark data={spark} /></td>
                    <td className="num">{item.divYield > 0 ? `${item.divYield.toFixed(2)}%` : '—'}</td>
                    <td className="num">{M(item.price)}</td>
                    <td className={`num ${tone(item.day)}`}>{pct(item.day)}</td>
                    <td className="num">
                      <div className="db-btn-row" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
                        <button type="button" className="db-btn lime" onClick={() => openTrade('invest', item.symbol)}>Buy</button>
                        {isHeld && <button type="button" className="db-btn ghost" onClick={() => openTrade('sell', item.symbol)}>Sell</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const yieldSection = (
    <div className="db-grid">
      <section className="db-card db-span-2 db-yield-hero-card">
        <div className="db-card-head">
          <div>
            <span className="db-tag">HIGH-YIELD CASH SWEEP</span>
            <h2 style={{ marginTop: 8 }}>{CASH_APY}% APY on Uninvested Cash</h2>
          </div>
          <Icon name="percent" size={24} />
        </div>
        <div className="db-kpi">
          <span>Current cash sweep balance</span>
          <strong>{M(state.cash)}</strong>
          <small>Accruing ~{M(monthlyCashInterest)}/month · {M(annualCashInterest)}/year</small>
        </div>
        <div className="db-btn-row">
          <button type="button" className="button button-lime" onClick={() => openTrade('deposit')}>Deposit cash</button>
          <button type="button" className="db-btn ghost" onClick={simulateCashInterest}>Simulate monthly payout</button>
        </div>
      </section>

      <section className="db-card db-span-2">
        <div className="db-card-head">
          <div>
            <span className="db-tag info">PASSIVE INCOME SUMMARY</span>
            <h2 style={{ marginTop: 8 }}>Dividend &amp; Interest Engine</h2>
          </div>
        </div>
        <div className="db-inspector-metrics">
          <div><span>Projected annual income</span><strong className="db-pos">{M(annualPassiveIncome)}</strong></div>
          <div><span>Dividend income (est.)</span><strong>{M(annualDividendIncome)}/yr</strong></div>
          <div><span>Cash sweep interest</span><strong>{M(annualCashInterest)}/yr</strong></div>
          <div><span>Portfolio yield</span><strong>{total > 0 ? ((annualPassiveIncome / total) * 100).toFixed(2) : '0.00'}%</strong></div>
        </div>
        <div className="db-setting" style={{ paddingBottom: 0, marginTop: 8 }}>
          <div>
            <strong>Automatic Dividend Reinvestment (DRIP)</strong>
            <small>{state.prefs.drip ? 'Dividends automatically purchase fractional shares.' : 'Dividends credit directly to your cash balance.'}</small>
          </div>
          <button
            type="button"
            className="db-switch"
            role="switch"
            aria-checked={state.prefs.drip}
            aria-label="Toggle DRIP dividend reinvestment"
            onClick={() => setPref({ drip: !state.prefs.drip })}
          />
        </div>
      </section>

      <section className="db-card db-span-4">
        <div className="db-card-head">
          <div>
            <h2>Dividend-paying holdings</h2>
            <span className="db-small db-muted">Simulate a quarterly dividend distribution to test DRIP share compounding or cash payouts.</span>
          </div>
        </div>
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Position Value</th>
                <th className="num">Annual Yield</th>
                <th className="num">Est. Quarterly Payout</th>
                <th className="num">Mode</th>
                <th className="num">Action</th>
              </tr>
            </thead>
            <tbody>
              {dividendHoldings.length === 0 && <tr><td colSpan={6} className="db-muted">No dividend-paying holdings in your portfolio yet.</td></tr>}
              {dividendHoldings.map(h => {
                const yld = h.divYield ?? lookupQuote(h.symbol, state.holdings, state.watchlist)?.divYield ?? 0;
                const qtr = (holdingValue(h) * (yld / 100)) / 4;
                return (
                  <tr key={h.symbol}>
                    <td><strong>{h.symbol}</strong><small>{h.name}</small></td>
                    <td className="num">{M(holdingValue(h))}</td>
                    <td className="num">{yld.toFixed(2)}%</td>
                    <td className="num db-pos">+{M(qtr)}</td>
                    <td className="num"><span className="db-tag info">{state.prefs.drip ? 'DRIP Shares' : 'Cash'}</span></td>
                    <td className="num">
                      <button type="button" className="db-btn ghost" onClick={() => simulateDividendPayout(h)}>
                        Simulate payout
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const autoinvest = (
    <div className="db-grid">
      <section className="db-card db-span-2">
        <div className="db-kpi"><span>Monthly-equivalent scheduled DCA</span><strong>{M(monthlyPlan)}</strong><small>{state.plans.filter(p => p.active).length} active recurring schedules</small></div>
      </section>
      <section className="db-card db-span-2">
        <div className="db-kpi"><span>Illustrative value in 10 years</span><strong>{M(estimatedInTenYears)}</strong><small>Assumes 7% average annual return. Not a forecast.</small></div>
      </section>
      <section className="db-card db-span-4">
        <div className="db-card-head">
          <div>
            <h2>Recurring DCA plans</h2>
            <span className="db-small db-muted">Automate dollar-cost averaging across ETFs, stocks, bonds, or crypto.</span>
          </div>
          {!planDraft && (
            <button type="button" className="button button-lime" onClick={() => setPlanDraft({ name: '', symbol: 'VOO', amount: '150', frequency: 'Monthly' })}>
              New DCA plan <Icon name="plus" size={16} />
            </button>
          )}
        </div>

        {planDraft && (
          <form className="db-form db-inline-creator" onSubmit={event => { event.preventDefault(); createPlan(); }}>
            <h3>Create recurring investment</h3>
            <div className="db-form-grid">
              <label className="db-field">Plan name
                <input value={planDraft.name} onChange={e => setPlanDraft({ ...planDraft, name: e.target.value })} placeholder="e.g. S&P 500 Wealth Builder" required />
              </label>
              <label className="db-field">Asset
                <select value={planDraft.symbol} onChange={e => setPlanDraft({ ...planDraft, symbol: e.target.value })}>
                  {assetOptions.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol} · {a.name}</option>)}
                </select>
              </label>
              <label className="db-field">Frequency
                <select value={planDraft.frequency} onChange={e => setPlanDraft({ ...planDraft, frequency: e.target.value as PlanFrequency })}>
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-weekly">Bi-weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>
              <label className="db-field">Amount (USD)
                <input type="number" min="1" step="1" value={planDraft.amount} onChange={e => setPlanDraft({ ...planDraft, amount: e.target.value })} required />
              </label>
            </div>
            <div className="db-btn-row" style={{ marginTop: 0 }}>
              <button type="submit" className="button button-lime">Save plan</button>
              <button type="button" className="db-btn ghost" onClick={() => setPlanDraft(null)}>Cancel</button>
            </div>
          </form>
        )}

        <ul className="db-list">
          {state.plans.map(plan => (
            <li key={plan.id} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <strong>{plan.name}</strong>
                <small>{plan.symbol} · {plan.frequency || 'Monthly'} · {plan.active ? `Next run ${fmtWhen(plan.nextRun)}` : 'Paused'}</small>
              </div>
              <label className="db-field" style={{ width: 130 }}>Amount (USD)
                <input type="number" min="0" step="1" value={plan.amount} onChange={event => setPlanAmount(plan.id, event.target.value)} aria-label={`Amount for ${plan.name}`} />
              </label>
              <div className="db-btn-row" style={{ marginTop: 0 }}>
                <button type="button" className="db-btn ghost" onClick={() => runPlan(plan)} disabled={!plan.active || plan.amount < 1}>Run sample</button>
                <button type="button" className="db-switch" role="switch" aria-checked={plan.active} aria-label={`${plan.active ? 'Pause' : 'Activate'} ${plan.name}`} onClick={() => togglePlan(plan.id)} />
                <button type="button" className="db-btn danger" onClick={() => removePlan(plan.id)} aria-label={`Delete ${plan.name}`}><Icon name="trash" size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const goals = (
    <div className="db-grid">
      {state.goals.map(goal => {
        const math = goalMath(goal);
        return (
          <section className="db-card db-span-2" key={goal.id}>
            <div className="db-card-head">
              <h2>{goal.name}</h2>
              <span className={`db-tag ${math.onTrack ? '' : 'warn'}`}>{math.onTrack ? 'On track' : 'Needs a boost'}</span>
            </div>
            <div className="db-kpi"><span>Saved</span><strong>{M(goal.saved)}</strong><small>of {M(goal.target)} target by {goal.dueYear} ({math.pct.toFixed(0)}%)</small></div>
            <div className="db-progress" aria-hidden="true"><span style={{ width: `${math.pct}%` }} /></div>
            <p className="db-small db-muted">Projected at current pace: {M(math.projected)} · Needed per month: {M(math.needed)}</p>
            <div className="db-btn-row" style={{ alignItems: 'flex-end' }}>
              <label className="db-field" style={{ width: 150 }}>Monthly contribution
                <input type="number" min="0" step="1" value={goal.monthly} onChange={event => setGoalMonthly(goal.id, event.target.value)} aria-label={`Monthly contribution for ${goal.name}`} />
              </label>
              <button type="button" className="db-btn lime" onClick={() => openTrade('goal', undefined, goal.id)}><Icon name="plus" size={15} /> Contribute</button>
              <button type="button" className="db-btn danger" onClick={() => removeGoal(goal.id)}><Icon name="trash" size={15} /> Remove</button>
            </div>
          </section>
        );
      })}
      <section className="db-card db-span-4">
        {!goalDraft ? (
          <div className="db-row-between">
            <div><h2>Add a financial goal</h2><p className="db-muted db-small">Plan for a home, retirement, education, or an emergency reserve.</p></div>
            <button type="button" className="button button-lime" onClick={() => setGoalDraft({ name: '', target: '10000', years: '5', monthly: '200' })}>New goal <Icon name="plus" size={16} /></button>
          </div>
        ) : (
          <form className="db-form" onSubmit={event => { event.preventDefault(); addGoal(); }}>
            <h2>New goal</h2>
            <div className="db-form-grid">
              <label className="db-field">Goal name<input value={goalDraft.name} onChange={event => setGoalDraft({ ...goalDraft, name: event.target.value })} placeholder="e.g. Education fund" maxLength={60} required /></label>
              <label className="db-field">Target (USD)<input type="number" min="1" step="1" value={goalDraft.target} onChange={event => setGoalDraft({ ...goalDraft, target: event.target.value })} required /></label>
              <label className="db-field">Years to goal<input type="number" min="1" max="50" step="1" value={goalDraft.years} onChange={event => setGoalDraft({ ...goalDraft, years: event.target.value })} required /></label>
              <label className="db-field">Monthly (USD)<input type="number" min="0" step="1" value={goalDraft.monthly} onChange={event => setGoalDraft({ ...goalDraft, monthly: event.target.value })} required /></label>
            </div>
            <div className="db-btn-row" style={{ marginTop: 0 }}>
              <button className="button button-lime" type="submit">Create goal</button>
              <button className="db-btn ghost" type="button" onClick={() => setGoalDraft(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );

  const filteredTotals = {
    invest: state.activity.filter(a => a.kind === 'invest' || a.kind === 'auto').reduce((sum, a) => sum + Math.abs(a.amount), 0),
    sales: state.activity.filter(a => a.kind === 'sell').reduce((sum, a) => sum + a.amount, 0),
    income: state.activity.filter(a => a.kind === 'dividend').reduce((sum, a) => sum + a.amount, 0),
  };

  const activity = (
    <div className="db-grid">
      <section className="db-card db-span-4">
        <div className="db-card-head">
          <div className="db-seg" role="group" aria-label="Filter activity">
            {([['all', 'All'], ['invest', 'Trades & DCA'], ['cash', 'Deposits & Withdrawals'], ['income', 'Dividends & Interest']] as const).map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'selected' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="db-btn ghost" onClick={exportCsv}><Icon name="download" size={15} /> Export CSV</button>
        </div>
        <div className="db-grid db-activity-totals" style={{ marginBottom: 18 }}>
          <div className="db-kpi"><span>Invested</span><strong>{M(filteredTotals.invest)}</strong></div>
          <div className="db-kpi"><span>Sale proceeds</span><strong>{M(filteredTotals.sales)}</strong></div>
          <div className="db-kpi"><span>Dividends &amp; interest</span><strong className="db-pos">{M(filteredTotals.income)}</strong></div>
          <div className="db-kpi"><span>Total entries</span><strong>{visibleActivity.length}</strong></div>
        </div>
        <ul className="db-list">
          {visibleActivity.length === 0 && <li><span className="db-muted">No activity in this category yet.</span></li>}
          {visibleActivity.map(item => (
            <li key={item.id}>
              <div><strong>{item.title}</strong><small>{item.detail} · {fmtWhen(item.date)}</small></div>
              <span className={`db-num ${item.amount < 0 ? '' : item.amount > 0 ? 'db-pos' : 'db-muted'}`}>
                {item.amount === 0 ? (item.kind === 'swap' ? 'Exchanged' : 'Completed') : `${item.amount > 0 ? '+' : '−'}${M(Math.abs(item.amount))}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const insights = (
    <div className="db-grid">
      <section className="db-card">
        <div className="db-kpi"><span>Allocation health</span><strong>{healthScore}/100</strong><small>{healthScore >= 85 ? 'Well balanced' : 'Drift detected'}</small></div>
      </section>
      <section className="db-card">
        <div className="db-kpi"><span>Risk profile</span><strong>{riskLabel}</strong><small>Aligned to onboarding</small></div>
      </section>
      <section className="db-card">
        <div className="db-kpi"><span>Illustrative annual fee</span><strong>{M(annualFee)}</strong><small>Example 0.25% advisory model</small></div>
      </section>
      <section className="db-card">
        <div className="db-kpi"><span>Largest holding</span><strong>{topHolding ? topHolding.symbol : '—'}</strong><small>{topWeight.toFixed(1)}% of total value</small></div>
      </section>
      <section className="db-card db-span-2">
        <div className="db-card-head"><h2>Portfolio drift &amp; rebalancing</h2></div>
        {drift.length === 0 ? (
          <div className="db-alert ok"><Icon name="check" size={18} /><span>No rebalancing needed. Every asset class is within 5 points of its target.</span></div>
        ) : drift.map(d => (
          <div className="db-alert" key={d.key}><Icon name="bulb" size={18} /><span><strong>{d.key}</strong>: {d.weight.toFixed(1)}% now vs {d.target}% target ({d.diff > 0 ? `+${d.diff.toFixed(1)}% overweight` : `${d.diff.toFixed(1)}% underweight`}).</span></div>
        ))}
        <div className="db-btn-row">
          <button type="button" className="db-btn lime" onClick={() => setRebalanceOpen(true)}>
            <Icon name="sliders" size={15} /> Preview &amp; Apply 1-Click Rebalance
          </button>
        </div>
      </section>
      <section className="db-card db-span-2">
        <div className="db-card-head"><h2>Tax-loss harvesting opportunities</h2></div>
        {losers.length === 0 ? <p className="db-muted">No holdings are below their average cost basis right now.</p> : (
          <ul className="db-list">
            {losers.map(h => (
              <li key={h.symbol}>
                <div><strong>{h.symbol}</strong><small>Price {M(h.price)} vs avg cost {M(h.cost)}</small></div>
                <span className="db-num db-neg">{M((h.cost - h.price) * h.units)} unrealized loss</span>
              </li>
            ))}
          </ul>
        )}
        <p className="db-small db-muted" style={{ marginTop: 14 }}>Harvesting an unrealized loss may help offset capital gains depending on your tax jurisdiction.</p>
      </section>
      <section className="db-card db-span-4">
        <div className="db-card-head"><h2>Active price reminders</h2></div>
        {state.priceAlerts.length === 0 ? (
          <p className="db-muted db-small">No price reminders set. Click any asset in Portfolio or Markets to set a target alert.</p>
        ) : (
          <div className="db-chips">
            {state.priceAlerts.map(a => (
              <button key={a.symbol} type="button" onClick={() => setInspectedSymbol(a.symbol)}>
                <Icon name="bell" size={14} /> {a.symbol} {a.direction} {money(a.targetPrice)}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const settings = (
    <div className="db-grid">
      {(!SERVER_ACCOUNTS || !account?.serverUserId) && <section className="db-card db-span-4"><div className="db-card-head"><h2>Email notifications</h2></div><p className="db-small db-muted">Guest mode does not send emails. Explore our branded templates, including subtle pre-rendered 3D motion. Server accounts can manage delivery preferences here.</p><a href="#emails" className="db-btn" style={{marginTop:16}}>Explore email studio ↗</a></section>}
      {SERVER_ACCOUNTS && account?.serverUserId && <><ServerAccountTools account={account} onAccount={next => onAccount?.(next)} onSignedOut={onBack} /><WorkspaceSync snapshot={state} onRestore={setState} /><EmailNotifications /></>}

      <section className="db-card db-span-4">
        <div className="db-card-head"><h2>Display &amp; Investing Preferences</h2></div>
        <div className="db-setting">
          <div><strong>Show changes as</strong><small>Dollar amounts or percentages across the dashboard.</small></div>
          <div className="db-seg" role="group" aria-label="Show changes as">
            {(['value', 'percent'] as const).map(item => (
              <button key={item} type="button" className={state.prefs.valueMode === item ? 'selected' : ''} aria-pressed={state.prefs.valueMode === item} onClick={() => setPref({ valueMode: item })}>{item === 'value' ? 'Dollars' : 'Percent'}</button>
            ))}
          </div>
        </div>
        <div className="db-setting">
          <div><strong>Privacy mode</strong><small>Mask dollar balances when sharing your screen.</small></div>
          <button type="button" className="db-switch" role="switch" aria-checked={state.prefs.hideBalances} aria-label="Privacy mode" onClick={() => setPref({ hideBalances: !state.prefs.hideBalances })} />
        </div>
        <div className="db-setting">
          <div><strong>Automatic Dividend Reinvestment (DRIP)</strong><small>Reinvest dividend payouts into fractional shares automatically.</small></div>
          <button type="button" className="db-switch" role="switch" aria-checked={state.prefs.drip} aria-label="DRIP reinvestment" onClick={() => setPref({ drip: !state.prefs.drip })} />
        </div>
      </section>
      <section className="db-card db-span-4">
        <div className="db-card-head"><h2>Notifications</h2></div>
        <div className="db-setting">
          <div><strong>Portfolio reminders</strong><small>Show allocation drift, savings pace, and upcoming plan reminders.</small></div>
          <button type="button" className="db-switch" role="switch" aria-checked={state.prefs.alerts} aria-label="Portfolio reminders" onClick={() => setPref({ alerts: !state.prefs.alerts })} />
        </div>
        <div className="db-setting">
          <div><strong>Market volatility reassurance</strong><small>Display long-term context banners on down market days.</small></div>
          <button type="button" className="db-switch" role="switch" aria-checked={state.prefs.dailySummary} aria-label="Volatility context" onClick={() => setPref({ dailySummary: !state.prefs.dailySummary })} />
        </div>
      </section>
      <section className="db-card db-span-4">
        <div className="db-card-head"><h2>Account &amp; Data</h2></div>
        <div className="db-setting">
          <div><strong>{account.name}</strong><small>{account.email} · {account.plan} Plan</small></div>
          <span className="db-tag info">{riskLabel} risk</span>
        </div>
        <div className="db-btn-row">
          <button type="button" className="db-btn ghost" onClick={exportCsv}><Icon name="download" size={15} /> Export activity CSV</button>
          <button type="button" className="db-btn ghost" onClick={resetDemo}><Icon name="repeat" size={15} /> Restore sample portfolio</button>
          <button type="button" className="db-btn danger" onClick={onSignOut}><Icon name="logout" size={15} /> Sign out</button>
        </div>
        <div className="db-preview-info" style={{ marginTop: 18 }}>
          <strong>About this workspace:</strong> Portfolio balances, market performance, and account transactions on this dashboard are interactive sample records stored in your browser. The Crypto directory uses live CoinPaprika market data and may be delayed.
        </div>
      </section>
    </div>
  );

  const pages: Record<DashboardSection, ReactElement> = {
    overview,
    portfolio,
    markets,
    crypto: <CryptoMarket favorites={cryptoFavorites} onToggleFavorite={toggleCryptoFavorite} view={cryptoView} onViewChange={setCryptoView} />,
    yield: yieldSection,
    autoinvest,
    goals,
    activity,
    insights,
    settings,
  };
  const title = SECTIONS.find(s => s.id === section)?.label ?? 'Overview';
  const inspectedQuote = inspectedSymbol ? lookupQuote(inspectedSymbol, state.holdings, state.watchlist) : undefined;
  const inspectedHolding = inspectedSymbol ? state.holdings.find(h => h.symbol === inspectedSymbol) : undefined;

  return (
    <div className="db-page-wrap db-editorial">
      <DashboardHeader
        account={account}
        section={section}
        hideBalances={state.prefs.hideBalances}
        unreadCount={unreadCount}
        notifications={dashboardNotifications}
        readNotificationIds={state.readNotificationIds}
        onNavigate={navigateDashboard}
        onBackToWebsite={onBack}
        onOpenDeposit={() => openTrade('deposit')}
        onOpenTrade={() => openTrade('invest')}
        onTogglePrivacy={() => setPref({ hideBalances: !state.prefs.hideBalances })}
        onOpenCommand={() => setCommandOpen(true)}
        onSelectNotification={openNotification}
        onMarkAllRead={markNotificationsRead}
        onOpenSupport={onOpenSupport}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
      />

      <div className="db-shell">
        <aside className="db-side" aria-label="Dashboard workspace navigation" ref={navigationRef}>
          <div className="db-side-heading">YOUR WORKSPACE</div><div className="db-side-account"><span>Personal investing</span><small><i /> Demo account · USD</small></div>
          {SECTIONS.map(item => (
            <button
              type="button"
              key={item.id}
              className={`db-navbtn ${section === item.id ? 'active' : ''} ${MOBILE_PRIMARY.has(item.id) ? '' : 'db-navbtn-secondary'}`}
              onClick={() => navigateDashboard(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              aria-label={item.label}
            >
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={`db-navbtn db-mobile-more ${mobileMoreOpen ? 'active' : ''}`}
            aria-expanded={mobileMoreOpen}
            aria-label="More dashboard sections"
            onClick={() => setMobileMoreOpen(value => !value)}
          >
            <Icon name="menu" size={18} /><span>More</span>
          </button>
          {mobileMoreOpen && (
            <div className="db-more-panel" role="group" aria-label="More dashboard sections">
              {SECTIONS.filter(item => !MOBILE_PRIMARY.has(item.id)).map(item => (
                <button type="button" key={item.id} onClick={() => navigateDashboard(item.id)}>
                  <Icon name={item.icon} size={18} /><span>{item.label}</span>
                </button>
              ))}
              <button type="button" onClick={onBack}><Icon name="home" size={18} /><span>Website Home</span></button>
              <button type="button" onClick={onSignOut}><Icon name="logout" size={18} /><span>Sign out</span></button>
            </div>
          )}

          <div className="db-side-yield-card">
            <Icon name="sprout" size={24} /><span>The longer view.</span><strong>Little by little.<br />Over time.</strong><small>A plan for what matters to you.</small><button type="button" onClick={() => navigateDashboard('goals')}>Explore your goals <Icon name="arrow" size={14} /></button>
          </div>
        </aside>

        <main className={`db-main ${section === 'crypto' ? 'is-crypto' : ''}`}>
          <div className="db-subbar">
            <div>
              <span className="db-subbar-crumb">YOUR WORLD. IN PERSPECTIVE. / {title.toUpperCase()}</span>
              <h1>{section === 'overview' ? <>A little more perspective, <em>{firstName}.</em></> : title}</h1>
              <p className="db-subbar-description">{section === 'overview' ? 'Your investments, your progress, and what comes next.' : 'A considered space for your longer-term plans.'}</p>
            </div>
            <div className="db-subbar-actions">
              <button type="button" className="db-btn ghost" onClick={() => setCommandOpen(true)}>
                <Icon name="search" size={15} /> Quick Jump
              </button>
              <button type="button" className="db-btn" onClick={() => openTrade('invest')}>
                <Icon name="trend" size={15} /> Trade
              </button>
            </div>
          </div>

          <div className="db-content">
            <div className="db-sample-notice"><span><i /> DEMO WORKSPACE</span><p>Sample balances and simulated transactions. No real money moves.</p><span>USD · {account.country || 'Region not set'}</span></div>
            {section === 'overview' ? portfolioOverview : summaryHero}
            {pages[section]}
          </div>
        </main>
      </div>

      <DashboardFooter
        onNavigate={navigateDashboard}
        onBackToWebsite={onBack}
        onExportCsv={exportCsv}
        onResetSample={resetDemo}
        onOpenSupport={onOpenSupport}
        onOpenCareers={onOpenCareers}
      />

      <CommandPalette open={commandOpen} items={commandItems} onClose={() => setCommandOpen(false)} />

      {inspectedQuote && (
        <AssetInspectorModal
          quote={inspectedQuote}
          holding={inspectedHolding}
          totalPortfolio={total}
          watched={watchedSet.has(inspectedQuote.symbol)}
          existingAlert={state.priceAlerts.find(a => a.symbol === inspectedQuote.symbol)}
          onToggleWatch={() => toggleStockWatch(inspectedQuote)}
          onSaveAlert={savePriceAlert}
          onRemoveAlert={removePriceAlert}
          onBuy={() => { const s = inspectedQuote.symbol; setInspectedSymbol(null); openTrade('invest', s); }}
          onSell={() => { const s = inspectedQuote.symbol; setInspectedSymbol(null); openTrade('sell', s); }}
          onClose={() => setInspectedSymbol(null)}
        />
      )}

      {rebalanceOpen && (
        <RebalanceModal
          allocation={allocation}
          total={total}
          onApply={applySampleRebalance}
          onClose={() => setRebalanceOpen(false)}
        />
      )}

      {trade && (
        <TransactionSheet
          initial={trade}
          assets={assetOptions}
          country={account.country || 'United States'}
          cash={state.cash}
          goals={state.goals}
          onSubmit={submitTrade}
          onClose={() => setTrade(null)}
        />
      )}

      {toast && !trade && <div className="db-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
