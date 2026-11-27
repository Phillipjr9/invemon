import MarketChart from './MarketChart';
import AssetLogo from './AssetLogo';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import {
  formatCryptoChange,
  formatCryptoCompact,
  formatCryptoPrice,
  getCryptoCatalog,
  getCryptoHistory,
  getCryptoMarkets,
  getCryptoQuote,
  type CryptoAsset,
  type CryptoHistoryPoint,
  type CryptoPeriod,
  type CryptoQuote,
} from '../services/crypto';
import './crypto-market.css';

export type CryptoView = 'all' | 'watchlist';
type AssetStatus = 'active' | 'all' | 'inactive';
type SortOrder = 'rank' | 'name' | 'price' | 'gainers' | 'losers' | 'volume';

type Props = {
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  view: CryptoView;
  onViewChange: (view: CryptoView) => void;
};

const PAGE_SIZE = 20;
const PERIODS: CryptoPeriod[] = ['1D', '1W', '1M', '1Y'];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function CoinIcon({ asset, large = false }: { asset: CryptoAsset; large?: boolean }) {
  return <AssetLogo symbol={asset.symbol} coinId={asset.id} size={large ? 56 : 36} />;
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="crypto-na">--</span>;
  return <span className={`crypto-change ${value < 0 ? 'is-negative' : 'is-positive'}`}>{value < 0 ? '↓' : '↑'} {formatCryptoChange(value)}</span>;
}

function HistoryChart({ data, period }: { data: CryptoHistoryPoint[]; period: CryptoPeriod }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 620;
  const height = 210;
  const padding = 12;
  const prices = data.map(point => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (index: number) => data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
  const y = (price: number) => padding + (1 - (price - min) / span) * (height - padding * 2);
  const line = data.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.price).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)} ${height} L${x(0)} ${height} Z`;
  const selected = data[hover ?? data.length - 1];
  const change = data[0].price ? ((data[data.length - 1].price - data[0].price) / data[0].price) * 100 : null;
  const dateOptions: Intl.DateTimeFormatOptions = period === '1D' ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' };

  return (
    <div className="crypto-history">
      <div className="crypto-history-caption"><span>{formatCryptoPrice(selected.price)}</span><time>{new Date(selected.timestamp).toLocaleString('en-US', dateOptions)}</time></div>
      <div className="crypto-history-plot" onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        setHover(Math.round(position * (data.length - 1)));
      }} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price history for ${period}: from ${formatCryptoPrice(data[0].price)} to ${formatCryptoPrice(data[data.length - 1].price)}, ${formatCryptoChange(change)}.`}>
          <defs><linearGradient id="crypto-history-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8dc11c" stopOpacity=".25" /><stop offset="100%" stopColor="#8dc11c" stopOpacity="0" /></linearGradient></defs>
          {[0.25, 0.5, 0.75].map(step => <line key={step} x1="0" x2={width} y1={height * step} y2={height * step} stroke="#e8ebf2" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="url(#crypto-history-fill)" />
          <path d={line} fill="none" stroke="#79b51a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="#a9b2c6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /><circle cx={x(hover)} cy={y(selected.price)} r="5" fill="#79b51a" stroke="white" strokeWidth="2" /></>}
        </svg>
      </div>
      <div className="crypto-history-range"><span>{new Date(data[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><span>{new Date(data[data.length - 1].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
    </div>
  );
}

function CryptoDetail({ asset, quote, favorite, onToggle, onClose, onQuote }: {
  asset: CryptoAsset;
  quote: CryptoQuote | undefined;
  favorite: boolean;
  onToggle: () => void;
  onClose: () => void;
  onQuote: (quote: CryptoQuote) => void;
}) {
  const [period, setPeriod] = useState<CryptoPeriod>('1W');
  const [history, setHistory] = useState<CryptoHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(asset.active);
  const [historyError, setHistoryError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(asset.active && !quote);
  const [quoteError, setQuoteError] = useState('');
  const [historyRetry, setHistoryRetry] = useState(0);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef(quote);
  quoteRef.current = quote;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-close]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus({ preventScroll: true }); };
  }, [onClose]);

  useEffect(() => {
    if (!asset.active || (quoteRef.current?.price !== null && quoteRef.current?.price !== undefined && quoteRetry === 0)) return;
    const controller = new AbortController();
    setQuoteLoading(true);
    setQuoteError('');
    getCryptoQuote(asset.id, controller.signal).then(onQuote).catch(error => {
      if (!controller.signal.aborted) setQuoteError(errorMessage(error, 'A current quote is unavailable.'));
    }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    return () => controller.abort();
  }, [asset.id, asset.active, quoteRetry, onQuote]);

  useEffect(() => {
    if (!asset.active) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError('');
    setHistory([]);
    getCryptoHistory(asset.id, period, controller.signal).then(setHistory).catch(error => {
      if (!controller.signal.aborted) setHistoryError(errorMessage(error, 'Price history is temporarily unavailable.'));
    }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [asset.id, asset.active, period, historyRetry]);

  const updated = quote?.updatedAt ? new Date(quote.updatedAt) : null;
  const updatedText = updated && !Number.isNaN(updated.getTime()) ? updated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

  return createPortal(
    <div className="crypto-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crypto-dialog" role="dialog" aria-modal="true" aria-labelledby="crypto-detail-title" ref={dialogRef}>
        <div className="crypto-dialog-top">
          <div className="crypto-detail-identity"><CoinIcon key={asset.id} asset={asset} large /><div><span className="crypto-kicker">CRYPTOCURRENCY</span><h2 id="crypto-detail-title">{asset.name}</h2><p>{asset.symbol.toUpperCase()}{asset.rank ? ` / Rank #${asset.rank}` : ''}</p></div></div>
          <button data-close className="crypto-close" aria-label="Close cryptocurrency details" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <div className="crypto-detail-value"><div><span>Current price (USD)</span><strong>{quoteLoading && !quote ? 'Loading...' : formatCryptoPrice(quote?.price ?? null)}</strong></div><Change value={quote?.change24h ?? null} /></div>
        {quoteError && <p className="crypto-inline-error" role="status">{quoteError} <button onClick={() => setQuoteRetry(value => value + 1)}>Retry quote</button></p>}
        {!asset.active && <p className="crypto-inline-error">This asset is marked inactive by the data provider. Current prices may not be available.</p>}
        <div className="crypto-detail-chart-head"><h3>Price history</h3><div className="crypto-periods" aria-label="Price history period">{PERIODS.map(item => <button key={item} className={period === item ? 'is-active' : ''} aria-pressed={period === item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div>
        {historyLoading ? <div className="crypto-chart-placeholder"><span className="crypto-spinner" /> Loading price history</div> : historyError ? <div className="crypto-chart-placeholder"><span>{historyError}</span><button onClick={() => setHistoryRetry(value => value + 1)}>Retry</button></div> : history.length ? <HistoryChart key={`${asset.id}-${period}`} data={history} period={period} /> : <div className="crypto-chart-placeholder">No price history is available for this asset.</div>}
        <MarketChart key={asset.id} symbol={asset.symbol} coinId={asset.id} /><div className="crypto-metrics"><div><span>Market cap</span><strong>{formatCryptoCompact(quote?.marketCap ?? null)}</strong></div><div><span>24h volume</span><strong>{formatCryptoCompact(quote?.volume24h ?? null)}</strong></div><div><span>7d change</span><strong><Change value={quote?.change7d ?? null} /></strong></div><div><span>All-time high</span><strong>{formatCryptoPrice(quote?.athPrice ?? null)}</strong></div></div>
        <div className="crypto-detail-actions"><button className={`crypto-primary ${favorite ? 'is-saved' : ''}`} onClick={onToggle}><Icon name="star" size={16} /> {favorite ? 'Remove from watchlist' : 'Add to watchlist'}</button><a href={`https://coinpaprika.com/coin/${encodeURIComponent(asset.id)}/`} target="_blank" rel="noreferrer">View on CoinPaprika <Icon name="external" size={15} /></a></div>
        <p className="crypto-detail-disclaimer">{updatedText ? `Price last updated ${updatedText}. ` : ''}Data by CoinPaprika; prices may be delayed. Listing does not mean an asset is available to trade. The portfolio and orders on this site are simulated.</p>
      </div>
    </div>,
    document.body,
  );
}

export default function CryptoMarket({ favorites, onToggleFavorite, view, onViewChange }: Props) {
  const [assets, setAssets] = useState<CryptoAsset[]>([]);
  const [quotes, setQuotes] = useState<Map<string, CryptoQuote>>(new Map());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [marketError, setMarketError] = useState('');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [assetStatus, setAssetStatus] = useState<AssetStatus>('active');
  const [sort, setSort] = useState<SortOrder>('rank');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CryptoAsset | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setMarketLoading(true);
    setCatalogError('');
    setMarketError('');

    getCryptoCatalog(controller.signal).then(setAssets).catch(error => {
      if (!controller.signal.aborted) setCatalogError(errorMessage(error, 'The full cryptocurrency directory is unavailable.'));
    }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });

    getCryptoMarkets(controller.signal, reload > 0).then(snapshot => {
      setAssets(current => current.length ? current : snapshot.assets);
      setQuotes(snapshot.quotes);
      setFetchedAt(snapshot.fetchedAt);
    }).catch(error => {
      if (!controller.signal.aborted) setMarketError(errorMessage(error, 'Cryptocurrency prices are unavailable.'));
    }).finally(() => { if (!controller.signal.aborted) setMarketLoading(false); });

    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') setReload(value => value + 1);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const closeDetail = useCallback(() => setSelected(null), []);
  const receiveQuote = useCallback((quote: CryptoQuote) => {
    setQuotes(current => new Map(current).set(quote.id, quote));
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const filteredAssets = useMemo(() => {
    const matchScore = (asset: CryptoAsset) => {
      const symbol = asset.symbol.toLowerCase();
      const name = asset.name.toLowerCase();
      if (symbol === deferredQuery || name === deferredQuery || asset.id.toLowerCase() === deferredQuery) return 0;
      if (symbol.startsWith(deferredQuery) || name.startsWith(deferredQuery)) return 1;
      return 2;
    };
    const matched = assets.filter(asset => {
      if (view === 'watchlist' && !favoriteIds.has(asset.id)) return false;
      if (assetStatus === 'active' && !asset.active) return false;
      if (assetStatus === 'inactive' && asset.active) return false;
      return !deferredQuery || `${asset.name} ${asset.symbol} ${asset.id}`.toLowerCase().includes(deferredQuery);
    });

    matched.sort((a, b) => {
      if (deferredQuery) {
        const difference = matchScore(a) - matchScore(b);
        if (difference) return difference;
      }
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'rank') return (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
      const qa = quotes.get(a.id);
      const qb = quotes.get(b.id);
      const field = sort === 'price' ? 'price' : sort === 'volume' ? 'volume24h' : 'change24h';
      const va = qa?.[field] ?? null;
      const vb = qb?.[field] ?? null;
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      if (va === null || vb === null) return a.name.localeCompare(b.name);
      return sort === 'losers' ? va - vb : vb - va;
    });
    return matched;
  }, [assets, assetStatus, deferredQuery, favoriteIds, quotes, sort, view]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageAssets = filteredAssets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeCount = useMemo(() => assets.filter(asset => asset.active).length, [assets]);
  const busy = catalogLoading && marketLoading && assets.length === 0;
  const unavailable = !catalogLoading && !marketLoading && assets.length === 0;
  const timestamp = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  const changeView = (next: CryptoView) => { onViewChange(next); setPage(1); setAssetStatus(next === 'watchlist' ? 'all' : 'active'); };

  return (
    <div className="crypto-page">
      <section className="crypto-hero" aria-labelledby="crypto-title">
        <div className="crypto-hero-copy"><span className="crypto-eyebrow"><span /> DIGITAL ASSET EXPLORER</span><h2 id="crypto-title">The crypto market,<br /><em>all in one place.</em></h2><p>Find the coins you know and discover the ones you don't. Explore the market with a clearer view.</p><div className="crypto-source"><span className="crypto-source-dot" /> Data by <a href="https://coinpaprika.com/" target="_blank" rel="noreferrer">CoinPaprika <Icon name="external" size={12} /></a><span className="crypto-source-separator">/</span> USD <span className="crypto-source-separator">/</span> {timestamp ? `Fetched ${timestamp}` : 'Connecting to market data'}</div></div>
        <div className="crypto-hero-visual" aria-hidden="true"><div className="crypto-orbit crypto-orbit-outer" /><div className="crypto-orbit crypto-orbit-inner" /><div className="crypto-hero-emblem"><Icon name="coins" size={48} /></div><span className="crypto-orbit-dot dot-one" /><span className="crypto-orbit-dot dot-two" /><span className="crypto-orbit-dot dot-three" /></div>
      </section>

      <section className="crypto-directory" aria-labelledby="crypto-directory-title">
        <div className="crypto-directory-top"><div><span className="crypto-kicker">EXPLORE THE MARKET</span><h3 id="crypto-directory-title">Cryptocurrencies</h3><p>{assets.length ? `${activeCount.toLocaleString()} active assets in the provider catalogue` : 'A wider view of digital assets'}</p></div><button className="crypto-refresh" onClick={() => setReload(value => value + 1)} disabled={catalogLoading || marketLoading}><Icon name="repeat" size={17} /> {catalogLoading || marketLoading ? 'Updating...' : 'Refresh prices'}</button></div>
        <div className="crypto-toolbar"><div className="crypto-tabs" role="group" aria-label="Cryptocurrency lists"><button className={view === 'all' ? 'is-active' : ''} aria-pressed={view === 'all'} onClick={() => changeView('all')}>All crypto</button><button className={view === 'watchlist' ? 'is-active' : ''} aria-pressed={view === 'watchlist'} onClick={() => changeView('watchlist')}><Icon name="star" size={14} /> Watchlist <span>{favorites.length}</span></button></div><label className="crypto-search"><Icon name="search" size={18} /><input type="search" placeholder="Search coin or symbol" aria-label="Search cryptocurrencies" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label></div>
        <div className="crypto-filters"><div className="crypto-count" aria-live="polite">{busy ? 'Loading cryptocurrency data...' : `${filteredAssets.length.toLocaleString()} ${view === 'watchlist' ? 'saved' : 'listed'} ${filteredAssets.length === 1 ? 'asset' : 'assets'}`}</div><div className="crypto-filter-controls"><label><span>Status</span><select value={assetStatus} onChange={event => { setAssetStatus(event.target.value as AssetStatus); setPage(1); }} aria-label="Filter cryptocurrency status"><option value="active">Active</option><option value="all">All listed</option><option value="inactive">Inactive</option></select></label><label><span>Sort by</span><select value={sort} onChange={event => { setSort(event.target.value as SortOrder); setPage(1); }} aria-label="Sort cryptocurrencies"><option value="rank">Market rank</option><option value="name">Name</option><option value="price">Highest price</option><option value="gainers">Top gainers (24h)</option><option value="losers">Top losers (24h)</option><option value="volume">24h volume</option></select></label></div></div>

        {(catalogError || marketError) && !unavailable && <div className="crypto-provider-warning" role="status"><Icon name="bulb" size={18} /><span>{catalogError ? 'The full directory could not be refreshed. Showing any available listings. ' : ''}{marketError ? 'Some prices could not be refreshed and may be unavailable. ' : ''}<button onClick={() => setReload(value => value + 1)}>Try again</button></span></div>}

        {busy ? <div className="crypto-loading"><span className="crypto-spinner" /><strong>Bringing the market together</strong><p>Loading coins and the latest available quotes.</p></div> : unavailable ? <div className="crypto-empty"><span className="crypto-empty-icon"><Icon name="coins" size={26} /></span><h4>Market data is unavailable</h4><p>We couldn't reach CoinPaprika. Check your connection and try again.</p><button className="crypto-primary" onClick={() => setReload(value => value + 1)}>Try again</button></div> : filteredAssets.length === 0 ? <div className="crypto-empty"><span className="crypto-empty-icon"><Icon name={view === 'watchlist' && !query ? 'star' : 'search'} size={24} /></span><h4>{view === 'watchlist' && !query && !favorites.length ? 'Your watchlist starts here' : 'No cryptocurrencies found'}</h4><p>{view === 'watchlist' && !query && !favorites.length ? 'Save the assets you want to keep an eye on.' : 'Try another name, symbol, or status filter.'}</p>{view === 'watchlist' && !favorites.length ? <button className="crypto-primary" onClick={() => changeView('all')}>Explore all crypto</button> : <button className="crypto-text-button" onClick={() => { setQuery(''); setAssetStatus('all'); setPage(1); }}>Clear filters</button>}</div> : (
          <>
            <div className="crypto-table-scroll"><table className="crypto-table"><thead><tr><th scope="col"><span className="sr-only">Watchlist</span></th><th scope="col">#</th><th scope="col">Asset</th><th scope="col" className="is-right">Price</th><th scope="col" className="is-right">24h change</th><th scope="col" className="is-right">Market cap</th><th scope="col" className="is-right">24h volume</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead><tbody>{pageAssets.map(asset => {
              const quote = quotes.get(asset.id);
              const saved = favoriteIds.has(asset.id);
              return <tr key={asset.id}><td><button className={`crypto-star ${saved ? 'is-saved' : ''}`} onClick={() => onToggleFavorite(asset.id)} aria-label={`${saved ? 'Remove' : 'Add'} ${asset.name} ${saved ? 'from' : 'to'} watchlist`} aria-pressed={saved}><Icon name="star" size={18} /></button></td><td className="crypto-rank">{asset.rank || '--'}</td><td><button className="crypto-asset" onClick={() => setSelected(asset)} aria-label={`View ${asset.name} details`}><CoinIcon asset={asset} /><span><strong>{asset.name}</strong><small>{asset.symbol.toUpperCase()}{!asset.active && <em>Inactive</em>}</small></span></button></td><td className="is-right crypto-price">{quote?.price === null || quote?.price === undefined ? <button className="crypto-quote-link" onClick={() => setSelected(asset)}>{asset.active ? 'View quote' : '--'}</button> : formatCryptoPrice(quote.price)}</td><td className="is-right"><Change value={quote?.change24h ?? null} /></td><td className="is-right crypto-muted-value">{quote?.marketCap === null || quote?.marketCap === undefined ? '--' : formatCryptoCompact(quote.marketCap)}</td><td className="is-right crypto-muted-value">{quote?.volume24h === null || quote?.volume24h === undefined ? '--' : formatCryptoCompact(quote.volume24h)}</td><td><button className="crypto-row-arrow" onClick={() => setSelected(asset)} aria-label={`Open ${asset.name} details`}><Icon name="arrow" size={17} /></button></td></tr>;
            })}</tbody></table></div>
            <div className="crypto-pagination"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredAssets.length)} of {filteredAssets.length.toLocaleString()} assets</span><div><button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} aria-label="Previous cryptocurrency page"><Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} /> Previous</button><span>Page {currentPage} of {totalPages.toLocaleString()}</span><button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} aria-label="Next cryptocurrency page">Next <Icon name="arrow" size={16} /></button></div></div>
          </>
        )}
        <div className="crypto-directory-note"><Icon name="shield" size={18} /><p>Prices may be delayed. The free bulk feed provides quotes for up to 2,000 assets; open another active asset to request its quote. Your crypto watchlist is saved on this device. Market listings do not imply trading support.</p></div>
      </section>

      {selected && <CryptoDetail asset={selected} quote={quotes.get(selected.id)} favorite={favoriteIds.has(selected.id)} onToggle={() => onToggleFavorite(selected.id)} onClose={closeDetail} onQuote={receiveQuote} />}
    </div>
  );
}