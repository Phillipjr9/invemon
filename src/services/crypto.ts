const configuredBase = (import.meta as ImportMeta & { env?: { VITE_CRYPTO_API_BASE_URL?: string } }).env?.VITE_CRYPTO_API_BASE_URL;
const API_BASE = configuredBase?.trim().replace(/\/+$/, '') || 'https://api.coinpaprika.com/v1';
const CATALOG_TTL = 30 * 60 * 1000;
const MARKET_TTL = 5 * 60 * 1000;

export type CryptoAsset = {
  id: string;
  name: string;
  symbol: string;
  rank: number | null;
  active: boolean;
  type: string;
};

export type CryptoQuote = {
  id: string;
  price: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  athPrice: number | null;
  supply: number | null;
  updatedAt: string | null;
};

export type CryptoHistoryPoint = { timestamp: string; price: number };
export type CryptoPeriod = '1D' | '1W' | '1M' | '1Y';

type CoinResponse = {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  is_active: boolean;
  type: string;
};

type TickerResponse = {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  total_supply?: number | null;
  last_updated?: string | null;
  quotes?: {
    USD?: {
      price?: number | null;
      percent_change_24h?: number | null;
      percent_change_7d?: number | null;
      market_cap?: number | null;
      volume_24h?: number | null;
      ath_price?: number | null;
    };
  };
};

export type CryptoSnapshot = {
  assets: CryptoAsset[];
  quotes: Map<string, CryptoQuote>;
  fetchedAt: number;
};

let catalogCache: { data: CryptoAsset[]; fetchedAt: number } | null = null;
let marketCache: { data: CryptoSnapshot; fetchedAt: number } | null = null;

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      if (response.status === 429) throw new Error('The market data provider is receiving too many requests. Please try again shortly.');
      throw new Error(`Market data is temporarily unavailable (HTTP ${response.status}).`);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The market data request timed out. Please check your connection and try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function toQuote(ticker: TickerResponse): CryptoQuote {
  const usd = ticker.quotes?.USD;
  return {
    id: ticker.id,
    price: numberOrNull(usd?.price),
    change24h: numberOrNull(usd?.percent_change_24h),
    change7d: numberOrNull(usd?.percent_change_7d),
    marketCap: numberOrNull(usd?.market_cap),
    volume24h: numberOrNull(usd?.volume_24h),
    athPrice: numberOrNull(usd?.ath_price),
    supply: numberOrNull(ticker.total_supply),
    updatedAt: ticker.last_updated || null,
  };
}

export async function getCryptoCatalog(signal?: AbortSignal, force = false): Promise<CryptoAsset[]> {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL) return catalogCache.data;
  const response = await requestJson<CoinResponse[]>('/coins', signal);
  if (!Array.isArray(response)) throw new Error('The cryptocurrency directory returned an unexpected response.');
  const data = response
    .filter(coin => typeof coin.id === 'string' && typeof coin.name === 'string' && typeof coin.symbol === 'string')
    .map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      rank: typeof coin.rank === 'number' && coin.rank > 0 ? coin.rank : null,
      active: coin.is_active === true,
      type: coin.type || 'coin',
    }));
  catalogCache = { data, fetchedAt: Date.now() };
  return data;
}

export async function getCryptoMarkets(signal?: AbortSignal, force = false): Promise<CryptoSnapshot> {
  if (!force && marketCache && Date.now() - marketCache.fetchedAt < MARKET_TTL) return marketCache.data;
  const response = await requestJson<TickerResponse[]>('/tickers?quotes=USD', signal);
  if (!Array.isArray(response)) throw new Error('The cryptocurrency prices returned an unexpected response.');
  const assets = response.map(ticker => ({
    id: ticker.id,
    name: ticker.name,
    symbol: ticker.symbol,
    rank: ticker.rank > 0 ? ticker.rank : null,
    active: true,
    type: 'coin',
  }));
  const quotes = new Map(response.map(ticker => [ticker.id, toQuote(ticker)]));
  const data = { assets, quotes, fetchedAt: Date.now() };
  marketCache = { data, fetchedAt: data.fetchedAt };
  return data;
}

export async function getCryptoQuote(id: string, signal?: AbortSignal): Promise<CryptoQuote> {
  const response = await requestJson<TickerResponse>(`/tickers/${encodeURIComponent(id)}?quotes=USD`, signal);
  if (!response || response.id !== id) throw new Error('A current quote is not available for this asset.');
  return toQuote(response);
}

export async function getCryptoHistory(id: string, period: CryptoPeriod, signal?: AbortSignal): Promise<CryptoHistoryPoint[]> {
  const settings: Record<CryptoPeriod, { days: number; interval: string }> = {
    '1D': { days: 1, interval: '1h' },
    '1W': { days: 7, interval: '24h' },
    '1M': { days: 30, interval: '24h' },
    '1Y': { days: 365, interval: '7d' },
  };
  const { days, interval } = settings[period];
  const boundaryBuffer = period === '1D' || period === '1Y' ? 5 * 60 * 1000 : 0;
  const params = new URLSearchParams({ start: new Date(Date.now() - days * 86400000 + boundaryBuffer).toISOString(), interval, quote: 'usd' });
  const response = await requestJson<CryptoHistoryPoint[]>(`/tickers/${encodeURIComponent(id)}/historical?${params}`, signal);
  if (!Array.isArray(response)) throw new Error('Price history is not available for this asset.');
  return response.filter(point => typeof point.timestamp === 'string' && typeof point.price === 'number' && Number.isFinite(point.price));
}

export function formatCryptoPrice(value: number | null): string {
  if (value === null) return 'Not available';
  if (value === 0) return '$0.00';
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : Math.min(16, Math.max(8, Math.ceil(-Math.log10(abs)) + 4));
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export function formatCryptoCompact(value: number | null): string {
  if (value === null) return 'Not available';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
}

export function formatCryptoChange(value: number | null): string {
  if (value === null) return 'Not available';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}