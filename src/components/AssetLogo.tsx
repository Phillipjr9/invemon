import { useState } from 'react';
import cryptoSymbols from './crypto-logo-symbols.json';
import './asset-logo.css';

const stockSymbols = new Set('VTI VOO BND QQQ SCHD TLT AAPL MSFT NVDA AMZN META GOOGL JPM TSLA ASML SAP AZN BHP SCHW IVZ BLK TM TCEHY'.split(' '));
const coins = new Set(cryptoSymbols);
const issuers: Record<string, string> = { '7203': 'TM', '0700': 'TCEHY' };

/** Decorative identity image; adjacent text provides the accessible asset name. */
export default function AssetLogo({ symbol, coinId, size = 36 }: { symbol: string; coinId?: string; size?: number }) {
  const ticker = symbol.trim().toUpperCase();
  const imageTicker = issuers[ticker] || ticker;
  const crypto = coins.has(ticker.toLowerCase()) && (Boolean(coinId) || !stockSymbols.has(imageTicker));
  // Only request files included in this build. No third-party logo hotlinks.
  const src = crypto ? `${import.meta.env.BASE_URL}assets/crypto-logos/${encodeURIComponent(ticker.toLowerCase())}.png`
    : !coinId && stockSymbols.has(imageTicker) ? `${import.meta.env.BASE_URL}assets/asset-logos/${imageTicker}.png` : '';
  const [failedSource, setFailedSource] = useState('');
  const [loadedSource, setLoadedSource] = useState('');
  const showImage = src && failedSource !== src;
  return <span className="asset-logo" style={{ width: size, height: size }} aria-hidden="true">
    <span className="asset-logo-fallback" style={{ visibility: showImage && loadedSource === src ? 'hidden' : 'visible' }}>{ticker.slice(0, 4) || '?'}</span>
    {showImage && <img key={src} src={src} alt="" loading="lazy" decoding="async"
      style={{ opacity: loadedSource === src ? 1 : 0 }}
      onLoad={() => setLoadedSource(src)} onError={() => setFailedSource(src)} />}
  </span>;
}
