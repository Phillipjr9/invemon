// Demo-only funding catalogue. No payment instructions or real wallet addresses.
export const BANK_METHODS = [
  { id: 'ach', name: 'ACH bank transfer', description: 'US bank accounts · USD', timing: 'Illustrative: 1–5 business days', limit: 25000, domestic: true },
  { id: 'wire', name: 'US domestic wire', description: 'US bank accounts · USD', timing: 'Illustrative: same or next business day', limit: 250000, domestic: true },
  { id: 'swift', name: 'International SWIFT', description: 'Cross-border bank transfer · USD only', timing: 'Illustrative: 1–5 business days; intermediary delays possible', limit: 250000, domestic: false },
] as const;
export type BankMethod = typeof BANK_METHODS[number]['id'];
export const DEMO_BANKS = [
  { id: 'demo-checking', name: 'Demo checking', ending: '1042', country: 'United States' },
  { id: 'demo-savings', name: 'Demo savings', ending: '8091', country: 'United States' },
  { id: 'demo-international', name: 'Demo international USD account', ending: '7056', country: 'United Kingdom' },
] as const;
export const FUNDING_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', price: 64420, decimals: 8, initial: '0.001', networks: ['Bitcoin'] },
  { symbol: 'ETH', name: 'Ethereum', price: 3420, decimals: 8, initial: '0.01', networks: ['Ethereum'] },
  { symbol: 'USDC', name: 'USD Coin', price: 1, decimals: 6, initial: '100', networks: ['Ethereum', 'Polygon'] },
  { symbol: 'USDT', name: 'Tether', price: 1, decimals: 6, initial: '100', networks: ['Ethereum', 'Tron'] },
  { symbol: 'XRP', name: 'XRP', price: .52, decimals: 6, initial: '25', networks: ['XRP Ledger'] },
] as const;
export type FundingCoin = typeof FUNDING_COINS[number]['symbol'];
export type FundingDraft = {
  kind: 'bank' | 'crypto'; method: BankMethod; bankId: string;
  coin: FundingCoin; network: string; quantity: string; address: string; memo: string; acknowledged: boolean;
};
export type FundingRequest = FundingDraft & { reference?: string };
export type FundingReceipt = {
  kind: 'bank' | 'crypto'; method: string; currency: string; network?: string; quantity?: number;
  sourceOrDestination: string; tag?: string; timing: string; fee: string; reference?: string;
};
type PriceAsset = { symbol: string; price: number; units?: number };
export const demoAddress = (coin: string, network: string) => `DEMO-ONLY:${coin}:${network.toUpperCase().replace(/ /g, '-')}:NOT-A-WALLET`;
export const initialFunding = (country: string): FundingDraft => ({ kind: 'bank', method: country === 'United States' ? 'ach' : 'swift', bankId: country === 'United States' ? 'demo-checking' : 'demo-international', coin: 'BTC', network: 'Bitcoin', quantity: '0.001', address: '', memo: '', acknowledged: false });
export function fundingPrice(coin: string, assets: PriceAsset[]) {
  return assets.find(a => a.symbol === coin)?.price ?? FUNDING_COINS.find(c => c.symbol === coin)?.price ?? 0;
}
export function fundingReceipt(request: FundingRequest): FundingReceipt {
  if (request.kind === 'bank') {
    const bank = DEMO_BANKS.find(b => b.id === request.bankId)!;
    const method = BANK_METHODS.find(m => m.id === request.method)!;
    return { kind: 'bank', method: method.name, currency: 'USD', sourceOrDestination: `${bank.name} ••${bank.ending}`, timing: method.timing, fee: '$0.00 demo fee; actual provider, bank, FX, or intermediary fees may differ', reference: request.reference };
  }
  const address = request.address.startsWith('DEMO-ONLY:') ? 'Non-routable demo wallet' : `${request.address.slice(0, 8)}…${request.address.slice(-6)}`;
  return { kind: 'crypto', method: 'Crypto transfer', currency: request.coin, network: request.network, quantity: Number(request.quantity), sourceOrDestination: address, tag: request.coin === 'XRP' ? request.memo : undefined, timing: 'After network confirmations; timing varies by network and provider', fee: '0 demo network fee; real network and provider fees vary', reference: request.reference };
}
export function validateFunding(request: FundingRequest, direction: 'deposit' | 'withdraw', country: string, assets: PriceAsset[], usdAmount: number): string | null {
  if (request.kind === 'bank') {
    const method = BANK_METHODS.find(m => m.id === request.method);
    const bank = DEMO_BANKS.find(b => b.id === request.bankId);
    if (!method || !bank) return 'Choose a demo bank account and transfer method.';
    if (method.domestic && (country !== 'United States' || bank.country !== 'United States')) return 'ACH and US domestic wire require a US residence and US bank in this demo. Choose SWIFT instead.';
    if (usdAmount > method.limit) return `This method has a demo limit of $${method.limit.toLocaleString()} per transaction.`;
    return null;
  }
  if (request.kind !== 'crypto') return 'Choose a supported funding method.';
  const coin = FUNDING_COINS.find(c => c.symbol === request.coin);
  if (!coin || !(coin.networks as readonly string[]).includes(request.network)) return 'Choose a supported asset and matching network.';
  const quantity = Number(request.quantity);
  if (!/^\d+(\.\d+)?$/.test(request.quantity) || !Number.isFinite(quantity) || quantity <= 0) return 'Enter a positive crypto quantity.';
  if ((request.quantity.split('.')[1]?.length || 0) > coin.decimals) return `Use no more than ${coin.decimals} decimal places for ${coin.symbol} in this demo.`;
  const price = fundingPrice(coin.symbol, assets);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(usdAmount) || Math.abs(quantity * price - usdAmount) > .000001) return 'The sample quote changed. Review the amount again.';
  if (usdAmount < 1 || usdAmount > 1000000) return 'Crypto transfers must have a sample value between $1 and $1,000,000.';
  if (direction === 'withdraw' && quantity > (assets.find(a => a.symbol === coin.symbol)?.units || 0)) return `That quantity exceeds your available ${coin.symbol} holding. Cash cannot fund a crypto withdrawal.`;
  if (!request.acknowledged) return 'Confirm the selected asset and network before continuing.';
  if (direction === 'withdraw') {
    const address = request.address.trim();
    let valid = address === demoAddress(coin.symbol, request.network);
    if (!address.startsWith('DEMO-ONLY:')) {
      valid = request.network === 'Bitcoin' ? /^(bc1[a-z0-9]{25,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(address)
        : request.network === 'Ethereum' || request.network === 'Polygon' ? /^0x[a-fA-F0-9]{40}$/.test(address)
        : request.network === 'Tron' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
        : /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
    }
    if (!valid) return 'The address format does not match this demo asset/network. Use the sample destination to test safely.';
    if (coin.symbol === 'XRP' && (!/^\d{1,10}$/.test(request.memo) || Number(request.memo) > 4294967295)) return 'Enter a numeric XRP destination tag from 0 to 4294967295.';
  }
  return null;
}
