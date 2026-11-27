import Icon from './Icon';
import { BANK_METHODS, DEMO_BANKS, FUNDING_COINS, demoAddress, fundingPrice, type FundingDraft } from '../services/funding';
import './funding.css';

type Props = {
  draft: FundingDraft; onChange: (draft: FundingDraft) => void; direction: 'deposit' | 'withdraw';
  country: string; assets: { symbol: string; price: number; units?: number }[];
};
export default function FundingFields({ draft, onChange, direction, country, assets }: Props) {
  const update = (patch: Partial<FundingDraft>) => onChange({ ...draft, ...patch });
  const coin = FUNDING_COINS.find(c => c.symbol === draft.coin)!;
  const method = BANK_METHODS.find(m => m.id === draft.method)!;
  const price = fundingPrice(draft.coin, assets);
  const held = assets.find(a => a.symbol === draft.coin)?.units || 0;
  const banks = DEMO_BANKS.filter(b => !method.domestic || b.country === 'United States');
  const crypto = draft.kind === 'crypto';
  return <section className="funding-fields" aria-label={`${direction === 'deposit' ? 'Deposit' : 'Withdrawal'} method details`}>
    <div className="funding-channel" role="group" aria-label="Funding channel">
      <button type="button" aria-pressed={!crypto} className={!crypto ? 'selected' : ''} onClick={() => update({ kind: 'bank' })}><Icon name="buildings" size={19} /><span>Bank transfer<small>USD cash account</small></span><Icon name="check" size={14} /></button>
      <button type="button" aria-pressed={crypto} className={crypto ? 'selected' : ''} onClick={() => update({ kind: 'crypto', acknowledged: false })}><Icon name="coins" size={20} /><span>Crypto<small>Transfer digital assets</small></span><Icon name="check" size={14} /></button>
    </div>
    {!crypto ? <>
      <label className="db-field">Bank transfer method<select aria-label="Bank transfer method" value={draft.method} onChange={e => {
        const next = BANK_METHODS.find(m => m.id === e.target.value)!;
        update({ method: next.id, bankId: next.domestic && !DEMO_BANKS.some(b => b.id === draft.bankId && b.country === 'United States') ? 'demo-checking' : draft.bankId });
      }}>{BANK_METHODS.map(m => <option key={m.id} value={m.id} disabled={m.domestic && country !== 'United States'}>{m.name}{m.domestic && country !== 'United States' ? ' — US only' : ''}</option>)}<option disabled>SEPA — EUR account not available in this USD demo</option></select></label>
      <div className="funding-method-info"><span>{method.description}</span><span><Icon name="clock" size={12} />{method.timing}</span><small>Demo limit: ${method.limit.toLocaleString()}/transaction. Actual limits, eligibility, and fees depend on the provider.</small></div>
      <label className="db-field">{direction === 'deposit' ? 'Demo source bank' : 'Demo destination bank'}<select aria-label={direction === 'deposit' ? 'Demo source bank' : 'Demo destination bank'} value={draft.bankId} onChange={e => update({ bankId: e.target.value })}>{banks.map(b => <option key={b.id} value={b.id}>{b.name} ••{b.ending} · {b.country}</option>)}</select></label>
      <div className="funding-safe-instructions"><span><Icon name="shield" size={15} /> Fictional bank details only</span><p>{direction === 'deposit' ? 'Choose a sample bank to simulate an incoming transfer. We do not provide bank routing numbers or real payment instructions.' : 'Withdrawals go to a fictional sample account. No bank is linked or verified, and no payout will be sent.'}</p><p>Do not enter real bank details. SEPA, local-currency transfers, and FX conversion require additional account/provider support.</p></div>
    </> : <>
      <div className="funding-grid"><label className="db-field">Crypto asset<select aria-label="Crypto asset" value={draft.coin} onChange={e => {
        const next = FUNDING_COINS.find(c => c.symbol === e.target.value)!;
        update({ coin: next.symbol, network: next.networks[0], quantity: next.initial, address: '', memo: '', acknowledged: false });
      }}>{FUNDING_COINS.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} · {c.name}</option>)}</select></label>
      <label className="db-field">Network<select aria-label="Crypto network" value={draft.network} onChange={e => update({ network: e.target.value, address: '', memo: '', acknowledged: false })}>{coin.networks.map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
      <div className="funding-network-note"><Icon name="alert" size={16} /><p>Use only <strong>{draft.coin} on {draft.network}</strong>. Selecting the wrong network can cause permanent loss in a real transfer. This demo sends nothing.</p></div>
      {direction === 'deposit' ? <div className="funding-demo-wallet"><span>Non-routable deposit preview</span><code>{demoAddress(draft.coin, draft.network)}</code>{draft.coin === 'XRP' && <small>Sample destination tag: <strong>123456</strong> — required in a real custodial transfer.</small>}<p>Not a wallet address. Do not send funds. No QR code or usable payment address is generated.</p></div> : <>
        <label className="db-field">Destination address<input aria-label="Destination address" type="text" autoComplete="off" spellCheck={false} value={draft.address} maxLength={140} onChange={e => update({ address: e.target.value.trim(), acknowledged: false })} placeholder="Use the safe sample destination below" /></label>
        <button className="funding-sample-button" type="button" onClick={() => update({ address: demoAddress(draft.coin, draft.network), memo: draft.coin === 'XRP' ? '123456' : '', acknowledged: false })}><Icon name="wallet" size={14} />Use sample destination</button>
        {draft.coin === 'XRP' && <label className="db-field">Destination tag (required)<input aria-label="Destination tag" type="text" inputMode="numeric" autoComplete="off" value={draft.memo} maxLength={10} onChange={e => update({ memo: e.target.value, acknowledged: false })} placeholder="e.g. 123456" /></label>}
        <p className="funding-format-note">Format-only checks do not verify checksums, ownership, or network compatibility. Only a shortened destination is stored in demo activity. Never enter a seed phrase or private key.</p>
      </>}
      <label className="db-field funding-quantity">Amount ({draft.coin})<div><input aria-label={`Amount (${draft.coin})`} type="text" inputMode="decimal" autoComplete="off" value={draft.quantity} onChange={e => update({ quantity: e.target.value })} placeholder={coin.initial} /><span>{draft.coin}</span></div></label>
      <div className="funding-quote"><span>≈ {Number.isFinite(Number(draft.quantity)) ? (Number(draft.quantity) * price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }) : '—'} USD · Sample price</span><small>Deposits add crypto holdings. Withdrawals remove crypto holdings. USD cash is not converted.</small>{direction === 'withdraw' && <strong>Available: {held.toLocaleString('en-US', { maximumFractionDigits: coin.decimals })} {draft.coin}</strong>}</div>
      <label className="funding-ack"><input type="checkbox" checked={draft.acknowledged} onChange={e => update({ acknowledged: e.target.checked })} /><span>I confirm {draft.coin} on {draft.network}{draft.coin === 'XRP' ? ' and the destination tag' : ''}. I understand this is a simulation, not a real transfer.</span></label>
      <p className="funding-format-note">Demo fee: 0 {draft.coin}. Real network/provider fees and confirmation times vary. Minimum sample value $1; maximum $1,000,000. Assets and networks shown are demo choices, not a promise of live availability.</p>
    </>}
  </section>;
}
