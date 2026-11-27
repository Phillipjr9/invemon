import {db,randomUUID} from './core.mjs';
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid settlement account/order ID');return value;};
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid execution reference');return value;};
// INTERNAL VERIFIER BOUNDARY. These functions do NOT establish that provider
// evidence is true. Call ONLY after independent execution/custody verification.
// No customer/admin routes, worker callbacks or environment flags invoke them.
export async function recordVerifiedFill({orderId,provider,fillRef,sourceUnits,feeUnits,targetUnits,evidenceRef}){
 if(typeof sourceUnits!=='string'||! /^[1-9][0-9]{0,77}$/.test(sourceUnits)||typeof targetUnits!=='string'||! /^[1-9][0-9]{0,77}$/.test(targetUnits)||typeof feeUnits!=='string'||! /^(0|[1-9][0-9]{0,77})$/.test(feeUnits))throw new Error('Exact atomic-unit strings required');
 const rows=await db()`SELECT record_verified_execution_fill(${randomUUID()}::uuid,${uuid(orderId)}::uuid,${text(provider,80)},${text(fillRef,200)},${sourceUnits},${feeUnits},${targetUnits},${text(evidenceRef,300)}) AS id`;
 return rows[0].id;
}
export async function settleVerifiedCryptoExecution({orderId,outcome,targetAccountId,sourceCustodyId,targetCustodyId,feeAccountId,evidenceRef}){
 if(!['filled','cancelled_partial'].includes(outcome))throw new Error('Invalid settlement outcome');
 const rows=await db()`SELECT settle_verified_execution(${uuid(orderId)}::uuid,${outcome},${uuid(targetAccountId)}::uuid,${uuid(sourceCustodyId)}::uuid,${uuid(targetCustodyId)}::uuid,${uuid(feeAccountId)}::uuid,${text(evidenceRef,300)}) AS id`;
 return rows[0].id;
}
