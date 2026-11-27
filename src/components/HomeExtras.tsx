import { useMemo, useState } from 'react';
import Icon from './Icon';

const market = [
  { symbol: 'AAPL', price: 195.25, change: '+1.82%' },
  { symbol: 'NVDA', price: 131.4, change: '+2.41%' },
  { symbol: 'BTC', price: 64420, change: '+3.05%' },
  { symbol: 'SPY', price: 527.4, change: '+0.76%' },
  { symbol: 'TSLA', price: 248.9, change: '-0.62%' },
  { symbol: 'MSFT', price: 428.15, change: '+0.94%' },
  { symbol: 'ETH', price: 3420, change: '+1.27%' },
  { symbol: 'AMZN', price: 186.33, change: '+0.58%' },
];

export function MarketTicker() {
  return <div className="ticker ticker-home" aria-label="Live market snapshot"><div className="ticker-track">{[...market, ...market].map((item, index) => <span key={`${item.symbol}-${index}`}><strong>{item.symbol}</strong> ${item.price.toLocaleString()} <em className={item.change.startsWith('-') ? 'down' : 'up'}>{item.change}</em></span>)}</div></div>;
}

export function InvestmentCalculator({ onSignUp }: { onSignUp: () => void }) {
  const [monthly, setMonthly] = useState(250);
  const [years, setYears] = useState(10);
  const [returnRate, setReturnRate] = useState(8);

  const result = useMemo(() => {
    const months = years * 12;
    const rate = returnRate / 100 / 12;
    const future = rate === 0 ? monthly * months : monthly * (((Math.pow(1 + rate, months) - 1) / rate) * (1 + rate));
    const invested = monthly * months;
    return { future, invested, growth: future - invested };
  }, [monthly, years, returnRate]);

  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return <section className="calculator section" id="calculator"><div className="page-width calculator-grid"><div className="calculator-copy reveal"><span className="section-label">Growth calculator</span><h2>See what consistent investing can do.</h2><p>Adjust your monthly investment, time horizon, and expected return to estimate your future portfolio value.</p><div className="calculator-results"><div><span>Projected value</span><strong>{money(result.future)}</strong></div><div><span>You invest</span><strong>{money(result.invested)}</strong></div><div><span>Potential growth</span><strong className="up">{money(result.growth)}</strong></div></div><p className="calculator-note">Estimate only. Investing involves risk, including possible loss of principal. Returns are not guaranteed.</p></div><div className="calculator-card reveal"><label className="calc-field"><span>Monthly investment <b>${monthly}</b></span><input type="range" min="10" max="2000" step="10" value={monthly} onChange={event => setMonthly(Number(event.target.value))} /></label><label className="calc-field"><span>Time horizon <b>{years} years</b></span><input type="range" min="1" max="40" step="1" value={years} onChange={event => setYears(Number(event.target.value))} /></label><label className="calc-field"><span>Expected annual return <b>{returnRate}%</b></span><input type="range" min="0" max="20" step="0.5" value={returnRate} onChange={event => setReturnRate(Number(event.target.value))} /></label><button className="button button-lime full-width" onClick={onSignUp}>Start with ${monthly}/month <Icon name="arrow" size={18} /></button></div></div></section>;
}
