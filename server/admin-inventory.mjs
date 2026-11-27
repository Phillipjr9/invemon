import {checkPassword,HttpError,randomUUID} from './core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const units=v=>typeof v==='string'&&/^[1-9][0-9]{0,37}$/.test(v);
export async function inventoryView(sql){
 const assets=await sql`SELECT d.code,d.kind,a.decimals FROM dealer_assets d JOIN ledger_assets a ON a.code=d.code ORDER BY d.code`;
 const inventories=await sql`SELECT i.account_id AS id,a.asset,s.decimals,(-b.debit_units::numeric)::text AS units FROM dealer_inventory_accounts i JOIN ledger_accounts a ON a.id=i.account_id JOIN ledger_assets s ON s.code=a.asset JOIN ledger_account_balances b ON b.id=a.id ORDER BY a.asset,i.account_id`;
 const pairs=await sql`SELECT id,source_asset,target_asset,source_inventory,target_inventory,rate_numerator::text,rate_denominator::text,fee_bps,min_units::text,max_units::text,valid_until,enabled,revision FROM dealer_pairs ORDER BY source_asset,target_asset`;
 const events=await sql`SELECT id,actor_id,action,subject_id,note,before_state,after_state,created_at FROM dealer_admin_events ORDER BY created_at DESC,id DESC LIMIT 100`;
 return {assets,inventories,pairs,events,tradingEnabled:process.env.INTERNAL_TRADING_ENABLED==='true',fundingEnabled:false};
}
export async function inventoryChange(sql,user,input){
 if(!['pair.save','inventory.register','inventory.evidence'].includes(input.operation))throw new HttpError(400,'Unsupported inventory operation.');
 if(typeof input.note!=='string'||input.note.trim().length<1||input.note.length>2000)throw new HttpError(400,'An audit note of 1–2,000 characters is required.');
 const data=input.config;if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'Provide inventory configuration.');
 let id=input.id,revision=0;
 if(input.operation==='pair.save'){
  revision=input.revision;
  if(!uuid.test(id||'')||!Number.isInteger(revision)||revision<0||!uuid.test(data.sourceInventory||'')||!uuid.test(data.targetInventory||'')||typeof data.sourceAsset!=='string'||typeof data.targetAsset!=='string'||data.sourceAsset===data.targetAsset||!units(data.numerator)||!units(data.denominator)||!units(data.minUnits)||!units(data.maxUnits)||BigInt(data.maxUnits)<BigInt(data.minUnits)||!Number.isInteger(data.feeBps)||data.feeBps<0||data.feeBps>1000||typeof data.enabled!=='boolean'||typeof data.validUntil!=='string'||!Number.isFinite(Date.parse(data.validUntil)))throw new HttpError(400,'Check pair mapping, integer rate, limits, fee (0–1,000 bps), revision and expiry.');
 }else if(input.operation==='inventory.register'){
  id=randomUUID();if(typeof data.asset!=='string'||data.asset.length>80)throw new HttpError(400,'Select an approved asset.');
 }else if(!uuid.test(id||'')||typeof data.reference!=='string'||!data.reference.trim()||data.reference.length>200)throw new HttpError(400,'Select inventory and provide an evidence reference of 1–200 characters.');
 if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password for this inventory action.');
 try{
  await sql`SELECT admin_dealer_change(${randomUUID()}::uuid,${user.id}::uuid,${input.operation},${id}::uuid,${revision},${input.note.trim()},${JSON.stringify(data)}::jsonb)`;
 }catch(e){
  if(e.code==='40001')throw new HttpError(409,'This pair changed. Reload and review the latest revision before saving.');
  if(e.code==='P0002')throw new HttpError(404,'Inventory not found.');
  if(['22023','23505','23514','23503','22P02','22003','22007','22008'].includes(e.code))throw new HttpError(409,'Configuration unavailable: check approved assets, inventory mappings, unique pair, limits and expiry. Reload before retrying.');
  throw e;
 }
 return {id,saved:true,creditPosted:false};
}
