import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyEquivalent, allocationTargets, dailyProfit, monthlyApyAccrual } from '../src/utils/investment-math';
test('recurring amounts use annualized monthly equivalents',()=>{
 assert.equal(monthlyEquivalent(100,'Weekly'),100*52/12);
 assert.equal(monthlyEquivalent(100,'Bi-weekly'),100*26/12);
 assert.equal(monthlyEquivalent(100,'Monthly'),100);
});
test('every risk policy totals 100 and matches onboarding',()=>{
 for(const risk of ['Conservative','Balanced','Growth','Aggressive'])assert.equal(Object.values(allocationTargets(risk)).reduce((a,b)=>a+b,0),100);
 assert.equal(allocationTargets('Aggressive').Crypto,20);assert.equal(allocationTargets('Balanced').Crypto,5);assert.equal(allocationTargets('Conservative').Bonds,45);
});
test('daily P&L reconstructs prior value and APY compounds correctly',()=>{
 assert.ok(Math.abs(dailyProfit(110,10)-10)<1e-9);
 assert.ok(Math.abs(dailyProfit(90,-10)+10)<1e-9);
 assert.equal(monthlyApyAccrual(0,4.65),0);
 assert.ok(Math.abs(Math.pow(1+monthlyApyAccrual(1,4.65),12)-1.0465)<1e-9);
});
