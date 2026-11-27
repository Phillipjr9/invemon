import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import './transactions.css';
import FundingFields from './FundingFields';
import { initialFunding, fundingPrice, fundingReceipt, validateFunding, type FundingDraft, type FundingRequest, type FundingReceipt } from '../services/funding';

export type TradeMode = 'invest' | 'sell' | 'deposit' | 'withdraw' | 'swap' | 'goal';
export type AssetOption = { symbol: string; name: string; price: number; units?: number };
type GoalOption = { id: string; name: string; saved: number; target: number };
type Phase = 'edit' | 'review' | 'processing' | 'success';
type Snapshot = { mode: TradeMode; symbol: string; destination: string; goalId: string; dollars: number; from: string; to: string; sourceUnits?: number; targetUnits?: number; cashAfter: number; reference: string; fundingRequest?: FundingRequest; funding?: FundingReceipt; cryptoBalanceAfter?: number };
type Props = {
  initial: { mode: TradeMode; symbol?: string; goalId?: string };
  assets: AssetOption[];
  cash: number;
  country: string;
  goals: GoalOption[];
  onSubmit: (mode: TradeMode, symbol: string, amount: number, goalId?: string, destination?: string, funding?: FundingRequest) => string | null;
  onClose: () => void;
};
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const units = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
const config: Record<TradeMode, { title: string; label: string; icon: string; progress: string; success: string }> = {
  deposit: { title: 'Deposit Funds', label: 'Add money', icon: 'plus', progress: 'Adding a little possibility.', success: 'Money added.' },
  withdraw: { title: 'Withdraw Cash', label: 'Withdraw', icon: 'arrow', progress: 'Making your next move.', success: 'Withdrawal recorded.' },
  swap: { title: 'Swap Assets', label: 'Swap', icon: 'repeat', progress: 'A change in perspective.', success: 'Assets swapped.' },
  sell: { title: 'Sell Asset', label: 'Sell', icon: 'chart', progress: 'Making room for what’s next.', success: 'Sale completed.' },
  invest: { title: 'Buy Asset', label: 'Buy', icon: 'trend', progress: 'Building your bigger picture.', success: 'Investment added.' },
  goal: { title: 'Goal Contribution', label: 'Goal', icon: 'target', progress: 'One step closer.', success: 'Goal contribution added.' },
};

export default function TransactionSheet({ initial, assets, cash, country, goals, onSubmit, onClose }: Props) {
  const [mode, setMode] = useState<TradeMode>(initial.mode);
  const holdings = assets.filter(a => (a.units || 0) > 0);
  const [symbol, setSymbol] = useState(initial.symbol || ((initial.mode === 'sell' || initial.mode === 'swap') ? holdings[0]?.symbol : assets[0]?.symbol) || '');
  const [destination, setDestination] = useState(assets.find(a => a.symbol !== symbol)?.symbol || '');
  const [goalId, setGoalId] = useState(initial.goalId || goals[0]?.id || '');
  const [amount, setAmount] = useState('100');
  const [error, setError] = useState('');
  const [fundingDraft, setFundingDraft] = useState<FundingDraft>(() => initialFunding(country));
  const [phase, setPhase] = useState<Phase>('edit');
  const [step, setStep] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [completedAt, setCompletedAt] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>(phase);
  const submitRef = useRef(onSubmit);
  const closeRef = useRef(onClose);
  const confirmationLock = useRef(false);
  const applied = useRef(false);
  phaseRef.current = phase;
  submitRef.current = onSubmit;
  closeRef.current = onClose;
  const asset = assets.find(a => a.symbol === symbol);
  const target = assets.find(a => a.symbol === destination);
  const goal = goals.find(g => g.id === goalId);
  const positionMode = mode === 'sell' || mode === 'swap';
  const selectableAssets = positionMode ? holdings : assets;
  const maxAmount = mode === 'goal' ? Math.max(0, cash + assets.reduce((sum, item) => sum + (item.units || 0) * item.price, 0) - goals.reduce((sum, item) => sum + item.saved, 0)) : positionMode ? (asset?.units || 0) * (asset?.price || 0) : cash;
  const isFunding = mode === 'deposit' || mode === 'withdraw';
  const isCrypto = isFunding && fundingDraft.kind === 'crypto';
  const dollars = isCrypto ? Number(fundingDraft.quantity) * fundingPrice(fundingDraft.coin, assets) : Number(amount);
  const details = config[mode];
  const actionNoun = mode === 'invest' ? 'investment' : mode === 'withdraw' ? 'withdrawal' : mode === 'goal' ? 'contribution' : mode === 'sell' ? 'sale' : mode;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // Do not let dashboard-level Escape bypass processing protection.
        if (phaseRef.current !== 'processing') closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') || [])].filter(e => e.offsetParent !== null);
      if (!items.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const focus = dialogRef.current?.querySelector<HTMLElement>(phase === 'edit' ? '[data-autofocus]' : '[data-phase-heading]');
    focus?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'processing' || !snapshot) return;
    const timers = [window.setTimeout(() => setStep(1), 550), window.setTimeout(() => setStep(2), 1150), window.setTimeout(() => {
      if (applied.current) return;
      applied.current = true;
      let failure: string | null;
      try { failure = submitRef.current(snapshot.mode, snapshot.symbol, snapshot.dollars, snapshot.goalId, snapshot.destination, snapshot.fundingRequest); }
      catch { failure = 'The simulation could not be completed. Review your balances before trying again.'; }
      if (failure) {
        setError(failure); setPhase('edit'); confirmationLock.current = false; applied.current = false;
      } else { setCompletedAt(new Date().toLocaleString()); setPhase('success'); }
    }, 1800)];
    return () => timers.forEach(window.clearTimeout);
  }, [phase, snapshot]);

  const changeMode = (next: TradeMode) => {
    setMode(next); setError('');
    if ((next === 'sell' || next === 'swap') && !(asset?.units)) setSymbol(holdings[0]?.symbol || '');
    if (next === 'swap' && destination === symbol) setDestination(assets.find(a => a.symbol !== symbol)?.symbol || '');
  };

  const review = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (isFunding) {
      const failure = validateFunding(fundingDraft, mode as 'deposit' | 'withdraw', country, assets, dollars);
      if (failure) return setError(failure);
    }
    if (!Number.isFinite(dollars) || dollars < 1) return setError('Please enter a valid amount of at least $1.00.');
    if (!isCrypto && Math.abs(dollars * 100 - Math.round(dollars * 100)) > .000001) return setError('Use no more than two decimal places for a USD amount.');
    if (dollars > 1000000) return setError('The maximum amount per demo transaction is $1,000,000.');
    if (!isCrypto && mode !== 'deposit' && dollars > maxAmount) return setError(mode === 'goal' ? `That amount exceeds your unassigned portfolio value of ${money(maxAmount)}.` : positionMode ? `That amount exceeds your available position value of ${money(maxAmount)}.` : `That amount exceeds your available cash balance of ${money(cash)}.`);
    if ((positionMode || mode === 'invest') && (!asset || !Number.isFinite(asset.price) || asset.price <= 0)) return setError('Choose an available asset.');
    if (mode === 'goal' && !goal) return setError('Choose an available goal.');
    if (mode === 'swap' && (!target || !Number.isFinite(target.price) || target.price <= 0 || symbol === destination)) return setError('Choose two different, available assets to swap.');
    const reference = `DEMO-${globalThis.crypto?.randomUUID?.().slice(0, 12).toUpperCase() || Math.random().toString(36).slice(2, 14).toUpperCase()}`;
    const request = isFunding ? { ...fundingDraft, address: isCrypto && mode === 'deposit' ? `DEMO-ONLY:${fundingDraft.coin}:DEPOSIT-PREVIEW` : fundingDraft.address, memo: isCrypto && mode === 'deposit' && fundingDraft.coin === 'XRP' ? '123456' : fundingDraft.memo, reference } : undefined;
    const route = request ? fundingReceipt(request) : undefined;
    const from = isCrypto ? (mode === 'withdraw' ? `${fundingDraft.coin} portfolio` : 'Demo external wallet') : positionMode ? symbol : mode === 'deposit' ? route!.sourceOrDestination : mode === 'goal' ? 'Existing portfolio value' : 'USD cash account';
    const to = isCrypto ? (mode === 'withdraw' ? route!.sourceOrDestination : `${fundingDraft.coin} portfolio`) : mode === 'swap' ? destination : mode === 'invest' ? symbol : mode === 'withdraw' ? route!.sourceOrDestination : mode === 'goal' ? goal!.name : 'USD cash account';
    setSnapshot({ mode, symbol: isCrypto ? fundingDraft.coin : symbol, destination, goalId, dollars, from, to, fundingRequest: request, funding: route,
      cryptoBalanceAfter: isCrypto ? (assets.find(a => a.symbol === fundingDraft.coin)?.units || 0) + (mode === 'deposit' ? 1 : -1) * Number(fundingDraft.quantity) : undefined,
      sourceUnits: isCrypto && mode === 'withdraw' ? Number(fundingDraft.quantity) : positionMode ? dollars / asset!.price : undefined,
      targetUnits: isCrypto && mode === 'deposit' ? Number(fundingDraft.quantity) : (mode === 'swap' ? dollars / target!.price : mode === 'invest' ? dollars / asset!.price : undefined),
      cashAfter: cash + (isCrypto ? 0 : mode === 'deposit' || mode === 'sell' ? dollars : mode === 'swap' || mode === 'goal' ? 0 : -dollars),
      reference,
    });
    setPhase('review');
  };
  const confirm = () => {
    if (confirmationLock.current || !snapshot) return;
    confirmationLock.current = true; applied.current = false; setStep(0); phaseRef.current = 'processing'; setPhase('processing');
  };
  const close = () => { if (phaseRef.current !== 'processing') onClose(); };
  const movement = snapshot ? <div className="tx-movement"><div><span className="tx-asset-disc">{positionMode ? snapshot.from.slice(0, 3) : <Icon name="wallet" size={22} />}</span><small>{snapshot.from}</small></div><span className="tx-movement-line"><i /><Icon name={mode === 'swap' ? 'repeat' : 'arrow'} size={21} /></span><div><span className="tx-asset-disc tx-asset-disc-to">{mode === 'swap' || mode === 'invest' ? snapshot.to.slice(0, 3) : <Icon name={mode === 'goal' ? 'target' : 'wallet'} size={22} />}</span><small>{snapshot.to}</small></div></div> : null;
  const receiptRows = snapshot ? <dl className="tx-receipt-rows"><div><dt>From</dt><dd>{snapshot.from}{snapshot.sourceUnits !== undefined && <small>{units(snapshot.sourceUnits)} {snapshot.symbol}</small>}</dd></div><div><dt>To</dt><dd>{snapshot.to}{snapshot.targetUnits !== undefined && <small>{units(snapshot.targetUnits)} {mode === 'swap' ? snapshot.destination : snapshot.symbol}</small>}</dd></div>{snapshot.funding && <><div><dt>Method</dt><dd>{snapshot.funding.method}{snapshot.funding.network && <small>{snapshot.funding.currency} · {snapshot.funding.network}</small>}</dd></div>{snapshot.funding.tag && <div><dt>Destination tag</dt><dd>{snapshot.funding.tag}</dd></div>}<div><dt>Timing context</dt><dd><small>{snapshot.funding.timing}</small></dd></div></>}<div><dt>Demo fee</dt><dd>{snapshot.funding?.kind === 'crypto' ? `0 ${snapshot.funding.currency}` : '$0.00'} <small>{snapshot.funding ? snapshot.funding.fee : 'Illustrative only'}</small></dd></div>{snapshot.cryptoBalanceAfter !== undefined && <div><dt>Crypto balance after</dt><dd>{units(snapshot.cryptoBalanceAfter)} {snapshot.funding!.currency}</dd></div>}<div><dt>Cash after transaction</dt><dd>{money(snapshot.cashAfter)}</dd></div></dl> : null;
  const displayAmount = snapshot?.funding?.kind === 'crypto' ? `${units(snapshot.funding.quantity || 0)} ${snapshot.funding.currency}` : money(snapshot?.dollars || 0);
  return createPortal(<div className="db-modal-backdrop tx-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}><div className={`db-modal tx-sheet tx-phase-${phase} tx-mode-${mode}`} role="dialog" aria-modal="true" aria-labelledby="db-trade-title" ref={dialogRef} tabIndex={-1}>
    <header className="tx-header"><span><i /> DEMO TRANSACTION</span><button className="db-icon-btn" onClick={close} disabled={phase === 'processing'} aria-label="Close"><Icon name="close" size={20} /></button></header>
    {phase === 'edit' ? <>
      <span className="tx-edit-icon"><Icon name={details.icon} size={25} /></span><h2 id="db-trade-title">{details.title}</h2><p className="tx-subtitle">{mode === 'swap' ? 'A new balance. The same bigger picture.' : 'A considered move towards what comes next.'}</p>
      <div className="db-seg db-trade-modes" role="group" aria-label="Transaction type">{(['deposit', 'withdraw', 'invest', 'swap', 'sell', 'goal'] as TradeMode[]).map(item => <button key={item} type="button" className={mode === item ? 'selected' : ''} aria-pressed={mode === item} onClick={() => changeMode(item)}>{config[item].label}</button>)}</div>
      <form className="db-form tx-form" onSubmit={review} noValidate>
        {isFunding && <FundingFields draft={fundingDraft} onChange={next => { setFundingDraft(next); setError(''); }} direction={mode as 'deposit' | 'withdraw'} country={country} assets={assets} />}
        {(positionMode || mode === 'invest') && <label className="db-field">{mode === 'swap' ? 'From asset' : 'Asset'}<select aria-label={mode === 'swap' ? 'From asset' : 'Asset'} value={selectableAssets.some(a => a.symbol === symbol) ? symbol : ''} onChange={e => { setSymbol(e.target.value); setError(''); }}><option value="" disabled>Choose a holding</option>{selectableAssets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol} · {a.name}</option>)}</select></label>}
        {mode === 'swap' && <><button className="tx-reverse" type="button" disabled={!(target?.units)} aria-label="Reverse swap assets" title={target?.units ? 'Reverse assets' : 'You must own the destination asset to reverse'} onClick={() => { setSymbol(destination); setDestination(symbol); setError(''); }}><Icon name="repeat" size={17} /></button><label className="db-field">To asset<select aria-label="To asset" value={destination} onChange={e => { setDestination(e.target.value); setError(''); }}>{assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol} · {a.name}</option>)}</select></label></>}
        {mode === 'goal' && <p className="db-small db-muted">Goals earmark existing portfolio value. No cash is moved and total wealth stays unchanged.</p>}
        {mode === 'goal' && <label className="db-field">Savings goal<select aria-label="Savings goal" value={goalId} onChange={e => setGoalId(e.target.value)}>{goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
        {!isCrypto && <><label className="db-field tx-amount">Amount (USD)<span><span aria-hidden="true">$</span><input aria-label="Amount (USD)" type="number" inputMode="decimal" min="1" max={mode === 'deposit' ? 1000000 : maxAmount} step="0.01" value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} required data-autofocus aria-invalid={!!error} aria-describedby={error ? 'tx-error' : undefined} /></span></label>
        <div className="db-chips tx-presets">{[25, 100, 250, 500].map(n => <button type="button" key={n} onClick={() => { setAmount(String(n)); setError(''); }}>{money(n)}</button>)}{mode !== 'deposit' && <button type="button" onClick={() => { setAmount(String(Math.floor(maxAmount * 100) / 100)); setError(''); }}>{positionMode ? 'Max position' : 'Max cash'}</button>}</div>
        <div className="tx-available"><span>{mode === 'goal' ? 'Unassigned portfolio value' : positionMode ? 'Position available' : 'Available cash'}</span><strong>{money(maxAmount)}{positionMode ? ` · ${symbol}` : ''}</strong></div></>}
        {mode === 'swap' && target && asset && dollars > 0 && symbol !== destination && <div className="tx-swap-quote"><span>Estimated amount received</span><strong>{units(dollars / target.price)} {destination}</strong><small>1 {symbol} ≈ {units(asset.price / target.price)} {destination} · Sample prices</small></div>}
        {positionMode && holdings.length === 0 && <p className="tx-notice">No holdings available. Add a sample investment before selling or swapping.</p>}
        {error && <p id="tx-error" className="db-error" role="alert">{error}</p>}
        <button className="button button-lime full-width tx-primary" type="submit" disabled={((positionMode || mode === 'invest') && !asset) || (mode === 'goal' && !goal)}>Review {actionNoun} <Icon name="arrow" size={17} /></button>
      </form>
    </> : phase === 'review' && snapshot ? <div className="tx-review"><span className="tx-eyebrow">A MOMENT TO MAKE SURE</span><h2 id="db-trade-title" tabIndex={-1} data-phase-heading>Review your {actionNoun}.</h2><p className="tx-review-amount">{displayAmount}</p>{movement}{receiptRows}<p className="tx-notice">{mode === 'swap' ? 'This simulates selling one holding and buying another at sample prices. Cash stays unchanged. Real exchanges can involve fees and taxes.' : 'This updates your sample portfolio only. No bank or wallet service is connected, no real money moves, and no market order is placed.'}</p><button className="button button-lime full-width tx-primary" onClick={confirm}>Confirm {actionNoun} <Icon name="check" size={17} /></button><button className="tx-back" onClick={() => setPhase('edit')}><Icon name="arrowLeft" size={14} /> Edit details</button></div> : phase === 'processing' && snapshot ? <div className="tx-processing" role="status" aria-live="polite" aria-busy="true"><span className="tx-eyebrow">UPDATING YOUR SAMPLE PORTFOLIO</span><div className="tx-motion-scene" aria-hidden="true"><span className="tx-motion-ring"/><span className="tx-motion-ring tx-ring-two"/><span className="tx-motion-token tx-token-from"><Icon name={details.icon} size={29} /></span><span className="tx-motion-token tx-token-to"><Icon name={mode === 'swap' ? 'repeat' : 'wallet'} size={29} /></span><span className="tx-motion-dot"/></div><h2 id="db-trade-title" tabIndex={-1} data-phase-heading>{details.progress}</h2><p className="tx-processing-amount">{displayAmount}</p><ol className="tx-steps">{['Checking demo balances', mode === 'swap' ? 'Exchanging sample holdings' : 'Recording your sample transaction', 'Preparing your receipt'].map((label, i) => <li key={label} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}><span>{i < step ? <Icon name="check" size={12} /> : `0${i + 1}`}</span>{label}</li>)}</ol><div className="tx-progress-track"><span /></div><p className="tx-notice">A short simulation—not a bank transfer or live trade.</p></div> : snapshot ? <div className="tx-success"><span className="tx-success-emblem" aria-hidden="true"><svg width="43" height="43" viewBox="0 0 48 48" fill="none"><path d="m12 24 8 8 16-17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="tx-eyebrow">SAMPLE TRANSACTION COMPLETE</span><h2 id="db-trade-title" tabIndex={-1} data-phase-heading>{snapshot.funding?.kind === 'crypto' && mode === 'deposit' ? 'Crypto deposit recorded.' : details.success}</h2><p className="tx-review-amount">{displayAmount}</p>{receiptRows}<dl className="tx-reference"><div><dt>Demo reference</dt><dd>{snapshot.reference}</dd></div><div><dt>Recorded</dt><dd>{completedAt}</dd></div></dl><p className="tx-notice">Saved to your activity in this browser. No real funds moved.</p><button className="button button-lime full-width tx-primary" onClick={onClose}>Done <Icon name="check" size={17} /></button></div> : null}
    <footer className="tx-footer"><Icon name="shield" size={12} /><span>ILLUSTRATIVE ONLY · NO REAL-MONEY TRANSACTIONS</span></footer>
  </div></div>, document.body);
}
