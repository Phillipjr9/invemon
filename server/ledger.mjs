import { randomUUID } from 'node:crypto';
import { db } from './core.mjs';

// Internal accounting API only. Never expose this function directly to customer requests.
// The caller must reconcile independent provider/bank evidence before posting.
export async function postJournal({postingKey,evidenceRef,lines,reverses=null}) {
 if(typeof postingKey!=='string'||!postingKey.length||postingKey.length>200)throw new Error('Invalid posting key');
 if(typeof evidenceRef!=='string'||!evidenceRef.length||evidenceRef.length>300)throw new Error('Evidence reference required');
 if(!Array.isArray(lines)||lines.length<2||lines.length>100)throw new Error('Expected 2 to 100 lines');
 const normalized=lines.map(({accountId,asset,units})=>{
  if(typeof units!=='string'||! /^-?[1-9][0-9]{0,77}$/.test(units))throw new Error('Units must be exact nonzero integer strings');
  if(typeof accountId!=='string'||typeof asset!=='string')throw new Error('Account and asset required');
  return {accountId,asset,units};
 });
 const totals=new Map();for(const line of normalized)totals.set(line.asset,(totals.get(line.asset)||0n)+BigInt(line.units));
 if([...totals.values()].some(n=>n!==0n))throw new Error('Journal does not balance per asset');
 const rows=await db()`SELECT ledger_post(${randomUUID()}::uuid,${postingKey},${evidenceRef},${JSON.stringify(normalized)}::jsonb,${reverses}::uuid) AS id`;
 return rows[0].id;
}

// Parse decimal strings without Number/rounding. Reject unsupported precision.
export function decimalToUnits(value,decimals) {
 if(!Number.isInteger(decimals)||decimals<0||decimals>30||typeof value!=='string'||! /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))throw new Error('Invalid decimal amount');
 const [whole,fraction='']=value.split('.');
 if(fraction.length>decimals)throw new Error('Amount exceeds asset precision');
 const units=BigInt(whole+fraction.padEnd(decimals,'0')).toString();
 if(units.length>78)throw new Error('Amount exceeds ledger capacity');
 return units;
}
