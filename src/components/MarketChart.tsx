import { useEffect, useRef, useState } from 'react';
import './market-chart.css';

// Explicit listings prevent accidentally displaying a similarly named instrument.
export const CHART_SYMBOLS: Record<string, string> = {
 AAPL: 'NASDAQ:AAPL', MSFT: 'NASDAQ:MSFT', NVDA: 'NASDAQ:NVDA', AMZN: 'NASDAQ:AMZN',
 META: 'NASDAQ:META', GOOGL: 'NASDAQ:GOOGL', TSLA: 'NASDAQ:TSLA', JPM: 'NYSE:JPM',
 VTI: 'AMEX:VTI', VOO: 'AMEX:VOO', QQQ: 'NASDAQ:QQQ', SCHD: 'AMEX:SCHD', BND: 'NASDAQ:BND', TLT: 'NASDAQ:TLT',
 ASML: 'NASDAQ:ASML', SAP: 'NYSE:SAP', AZN: 'NASDAQ:AZN', BHP: 'NYSE:BHP', '7203': 'TSE:7203', '0700': 'HKEX:700',
};
// Coin IDs, rather than ticker-only guesses, avoid collisions in the crypto directory.
const CRYPTO_CHARTS: Record<string, string> = {
 'btc-bitcoin': 'COINBASE:BTCUSD', 'eth-ethereum': 'COINBASE:ETHUSD', 'sol-solana': 'COINBASE:SOLUSD',
 'ada-cardano': 'COINBASE:ADAUSD', 'xrp-xrp': 'COINBASE:XRPUSD', 'doge-dogecoin': 'COINBASE:DOGEUSD',
 'ltc-litecoin': 'COINBASE:LTCUSD', 'link-chainlink': 'COINBASE:LINKUSD', 'avax-avalanche': 'COINBASE:AVAXUSD',
 'dot-polkadot': 'COINBASE:DOTUSD', 'bnb-binance-coin': 'BINANCE:BNBUSDT', 'usdt-tether': 'KRAKEN:USDTUSD',
 'usdc-usd-coin': 'KRAKEN:USDCUSD',
};
const HELD_CRYPTO: Record<string, string> = { BTC: 'btc-bitcoin', ETH: 'eth-ethereum', USDC: 'usdc-usd-coin', USDT: 'usdt-tether', XRP: 'xrp-xrp' };
export function chartSymbol(symbol: string, coinId?: string) {
 return coinId ? CRYPTO_CHARTS[coinId] : CHART_SYMBOLS[symbol] || CRYPTO_CHARTS[HELD_CRYPTO[symbol]];
}

export default function MarketChart({ symbol, coinId }: { symbol: string; coinId?: string }) {
 const instrument = chartSymbol(symbol, coinId);
 const host = useRef<HTMLDivElement>(null);
 const [enabled, setEnabled] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [status, setStatus] = useState<'idle' | 'loading' | 'embedded' | 'unavailable'>('idle');
 const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
 useEffect(() => {
  const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
 }, []);
 useEffect(() => {
  const target = host.current;
  if (!enabled || !target || !instrument) return;
  setStatus('loading');
  target.replaceChildren();
  const widget = document.createElement('div'); widget.className = 'tradingview-widget-container__widget'; target.append(widget);
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true; script.type = 'text/javascript';
  script.textContent = JSON.stringify({ autosize: true, symbol: instrument, interval: 'D', timezone: 'Etc/UTC', theme,
   style: '1', locale: 'en', allow_symbol_change: false, calendar: false, hide_side_toolbar: false, withdateranges: true,
   support_host: 'https://www.tradingview.com' });
  script.onerror = () => setStatus('unavailable');
  // We can detect an embedded frame, not certify cross-origin price freshness.
  const observer = new MutationObserver(() => {
   const frame = target.querySelector('iframe');
   if (frame) { frame.title = `${symbol} market price chart by TradingView`; setStatus('embedded'); }
  });
  observer.observe(target, { childList: true, subtree: true });
  const timer = window.setTimeout(() => setStatus(current => current === 'loading' ? 'unavailable' : current), 15000);
  target.append(script);
  return () => { window.clearTimeout(timer); observer.disconnect(); script.onerror = null; target.replaceChildren(); };
 }, [enabled, instrument, theme, attempt, symbol]);
 return <section className="market-chart" aria-label={`${symbol} real market chart`}>
  <div className="market-chart-heading"><h3>Market price chart</h3><span>EXTERNAL MARKET DATA</span></div>
  {!instrument ? <p role="status">A verified chart listing is not configured for this asset. No generated price history is substituted.</p> : <>
   {!enabled && <div className="market-chart-consent"><p>Explore actual market history for <strong>{instrument}</strong>, with candles, time ranges, and drawing tools.</p><p>Loading connects to TradingView, a third-party service.</p><button type="button" className="db-btn" onClick={() => setEnabled(true)}>Load market chart</button></div>}
   {enabled && status === 'loading' && <p role="status">Loading external chart…</p>}
   {enabled && status === 'unavailable' && <div role="status"><p>The external chart could not be confirmed. Check your connection or content blocker. No sample chart is shown in its place.</p><button type="button" className="db-btn" onClick={() => setAttempt(value => value + 1)}>Retry chart</button></div>}
   <div ref={host} className="tradingview-widget-container market-chart-host" hidden={!enabled || status === 'unavailable'} />
   <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(instrument)}`} target="_blank" rel="noopener noreferrer">Open {instrument} on TradingView ↗</a>
  </>}
  <p className="market-chart-disclosure">Chart data by TradingView. Availability and delays depend on the exchange and instrument; see the chart’s own data status. Crypto charts show the named venue/pair, not a consolidated price. Sample portfolio balances, reference quotes, orders, and returns elsewhere in Invemon do not synchronize with this chart.</p>
 </section>;
}
