import {randomUUID} from 'node:crypto';
import {db} from './core.mjs';
// INTERNAL ONLY. Derive user/account/asset from authenticated, verified workflows.
// These functions do not initiate an order, send a payment or verify settlement.
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid account or reservation identifier');return value;};
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Required reference is invalid');return value;};
export async function reserveFunds({userId,accountId,asset,units,purpose,requestKey}){
 if(typeof units!=='string'||!/^[1-9][0-9]{0,77}$/.test(units))throw new Error('Reservation requires exact positive integer units');
 if(!['withdrawal','order'].includes(purpose))throw new Error('Invalid reservation purpose');
 const rows=await db()`SELECT reserve_customer_funds(${randomUUID()}::uuid,${uuid(userId)}::uuid,${uuid(accountId)}::uuid,${text(asset,80)},${units},${purpose},${text(requestKey,200)}) AS id`;
 return rows[0].id;
}
export async function releaseFunds({userId,reservationId,reason}){
 const rows=await db()`SELECT release_customer_funds(${uuid(userId)}::uuid,${uuid(reservationId)}::uuid,${text(reason,300)}) AS id`;return rows[0].id;
}
// Call only AFTER independent external evidence verification, never on admin
// approval alone. Atomically posts the debit journal and consumes its hold.
export async function finalizeReservedDebit({userId,reservationId,postingKey,evidenceRef,counterpartId}){
 const rows=await db()`SELECT consume_customer_funds(${uuid(userId)}::uuid,${uuid(reservationId)}::uuid,${randomUUID()}::uuid,${text(postingKey,200)},${text(evidenceRef,300)},${uuid(counterpartId)}::uuid) AS id`;return rows[0].id;
}
