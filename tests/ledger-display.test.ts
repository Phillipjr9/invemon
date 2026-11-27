import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatLedgerUnits} from '../src/utils/ledger-display';
test('ledger display preserves precision above safe integer range',()=>{
 assert.equal(formatLedgerUnits('900719925474099312345',8),'9,007,199,254,740.99312345');
 assert.equal(formatLedgerUnits('1',30),'0.000000000000000000000000000001');
});
test('ledger display supports zero, negative and integer assets exactly',()=>{
 assert.equal(formatLedgerUnits('0',2),'0');assert.equal(formatLedgerUnits('-12345',2),'-123.45');assert.equal(formatLedgerUnits('1000',0),'1,000');
});
test('ledger display rejects exponents, fractional atomic units and unsupported precision',()=>{
 for(const value of ['1e10','1.2','abc'])assert.throws(()=>formatLedgerUnits(value,2));
 for(const precision of [-1,31,1.2])assert.throws(()=>formatLedgerUnits('1',precision));
});
