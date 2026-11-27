import { RISK_BLUEPRINTS } from '../services/auth';
export function monthlyEquivalent(amount: number, frequency = 'Monthly') {
 return amount * (frequency === 'Weekly' ? 52 / 12 : frequency === 'Bi-weekly' ? 26 / 12 : 1);
}
export function allocationTargets(risk = 'Balanced') {
 const blueprint = RISK_BLUEPRINTS.find(item => item.id === risk) || RISK_BLUEPRINTS[1];
 const targets = { Stocks: 0, ETFs: 0, Bonds: 0, Crypto: 0, Cash: 0 };
 for (const item of blueprint.allocation) targets[item.label as keyof typeof targets] = item.pct;
 return targets;
}
export const dailyProfit = (value: number, dailyPercent: number) => dailyPercent > -100 ? value - value / (1 + dailyPercent / 100) : 0;
export const monthlyApyAccrual = (balance: number, apy: number) => balance * (Math.pow(1 + apy / 100, 1 / 12) - 1);
