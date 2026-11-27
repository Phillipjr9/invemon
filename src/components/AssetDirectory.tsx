import {useState} from 'react';
import AssetLogo from './AssetLogo';
import MarketChart from './MarketChart';
// Instrument identity only. Prices, returns and customer positions are not seeded.
const instruments=[
 ['VTI','Vanguard Total Stock Market ETF','ETFs'],['VOO','Vanguard S&P 500 ETF','ETFs'],['QQQ','Invesco QQQ Trust','ETFs'],['SCHD','Schwab US Dividend Equity ETF','ETFs'],
 ['AAPL','Apple Inc.','Stocks'],['MSFT','Microsoft Corp.','Stocks'],['NVDA','NVIDIA Corp.','Stocks'],['AMZN','Amazon.com Inc.','Stocks'],['META','Meta Platforms','Stocks'],['GOOGL','Alphabet Inc.','Stocks'],['JPM','JPMorgan Chase & Co.','Stocks'],['TSLA','Tesla Inc.','Stocks'],
 ['ASML','ASML Holding','Stocks'],['SAP','SAP SE','Stocks'],['AZN','AstraZeneca','Stocks'],['BHP','BHP Group','Stocks'],['TM','Toyota Motor Corp.','Stocks'],
 ['BND','Vanguard Total Bond Market ETF','Bond ETFs'],['TLT','iShares 20+ Year Treasury Bond ETF','Bond ETFs'],
];
export default function AssetDirectory(){
 const [selected,setSelected]=useState<string|null>(null);
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All');
 const rows=instruments.filter(([symbol,name,type])=>(filter==='All'||type===filter)&&`${symbol} ${name}`.toLowerCase().includes(query.toLowerCase()));
 return <section className="db-card asset-directory" aria-label="Asset directory"><div className="db-card-head"><div><h2>Explore assets</h2><p>Stocks, ETFs and bond funds. Listings are not account holdings or an offer to trade.</p></div></div>{selected&&<section className="asset-market-detail" aria-label={`${selected} chart detail`}><div className="db-card-head"><h3>{selected} · {instruments.find(row=>row[0]===selected)?.[1]}</h3><button className="db-btn ghost" onClick={()=>setSelected(null)}>Close asset chart</button></div><MarketChart key={selected} symbol={selected}/></section>}<div className="asset-directory-controls"><label>Find an asset<input type="search" placeholder="Search name or symbol" value={query} onChange={e=>setQuery(e.target.value)}/></label><label><span>Asset class</span><select aria-label="Asset class" value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Stocks','ETFs','Bond ETFs'].map(v=><option key={v}>{v}</option>)}</select></label></div><p className="db-muted">Quotes and execution are not connected. No estimated prices are shown.</p><ul className="asset-directory-list">{rows.map(([symbol,name,type])=><li key={symbol}><AssetLogo symbol={symbol} size={40}/><div><strong>{symbol}</strong><span>{name}</span></div><span className="db-tag">{type}</span><button className="db-btn ghost" aria-label={`View ${symbol} market chart`} onClick={()=>setSelected(symbol)}>View chart</button></li>)}</ul>{!rows.length&&<p role="status">No assets match your search.</p>}</section>;
}
