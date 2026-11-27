import {db,headers,guard,session,body,HttpError,fail,rateLimit,checkPassword,randomUUID} from '../core.mjs';
import {decimalToUnits} from '../ledger.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();await rateLimit(req,`dealer-${user.id}`,req.method==='GET'?120:20);
  const enabled=process.env.INTERNAL_TRADING_ENABLED==='true';
  if(req.method==='GET'){
   const pairs=await sql`SELECT p.id,p.source_asset,p.target_asset,p.fee_bps,p.min_units::text,p.max_units::text,p.valid_until,a.decimals AS source_decimals,b.decimals AS target_decimals FROM dealer_pairs p JOIN ledger_assets a ON a.code=p.source_asset JOIN ledger_assets b ON b.code=p.target_asset WHERE p.enabled AND p.valid_until>now() ORDER BY p.source_asset,p.target_asset`;
   const trades=await sql`SELECT t.quote_id AS id,t.created_at,t.journal_id,q.source_asset,q.target_asset,q.source_units::text,q.fee_units::text,q.target_units::text,a.decimals AS source_decimals,b.decimals AS target_decimals FROM dealer_trades t JOIN dealer_quotes q ON q.id=t.quote_id JOIN ledger_assets a ON a.code=q.source_asset JOIN ledger_assets b ON b.code=q.target_asset WHERE t.user_id=${user.id} ORDER BY t.created_at DESC,t.quote_id DESC LIMIT 100`;
   return res.status(200).json({enabled,pairs,trades,limit:100});
  }
  const input=body(req);if(!['quote','accept'].includes(input.action))throw new HttpError(400,'Unsupported internal trade action.');
  if(!enabled)throw new HttpError(503,'Internal inventory trading is not enabled.');
  if(input.action==='quote'){
   if(typeof input.pairId!=='string'||!uuid.test(input.pairId))throw new HttpError(400,'Select a configured crypto pair.');
   const pairs=await sql`SELECT a.decimals FROM dealer_pairs p JOIN ledger_assets a ON a.code=p.source_asset WHERE p.id=${input.pairId}`;
   if(!pairs.length)throw new HttpError(400,'Pair unavailable.');
   let units;try{units=decimalToUnits(input.amount,pairs[0].decimals);}catch{throw new HttpError(400,'Enter an exact positive amount within asset precision.');}
   const id=randomUUID();await sql`SELECT create_dealer_quote(${id}::uuid,${user.id}::uuid,${input.pairId}::uuid,${units})`;
   const quotes=await sql`SELECT q.id,q.source_asset,q.target_asset,q.source_units::text,q.fee_units::text,q.target_units::text,q.expires_at,a.decimals AS source_decimals,b.decimals AS target_decimals FROM dealer_quotes q JOIN ledger_assets a ON a.code=q.source_asset JOIN ledger_assets b ON b.code=q.target_asset WHERE q.id=${id} AND q.user_id=${user.id}`;
   return res.status(201).json({quote:quotes[0]});
  }
  if(typeof input.quoteId!=='string'||!uuid.test(input.quoteId))throw new HttpError(400,'Invalid quote ID.');
  if(!user.email_verified_at||!user.mfa_secret||!user.mfa_verified)throw new HttpError(403,'Verified email and an MFA-verified session are required.');
  if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password.');
  const rows=await sql`SELECT accept_dealer_quote(${input.quoteId}::uuid,${user.id}::uuid) AS journal_id`;
  return res.status(200).json({journalId:rows[0].journal_id,settled:true,externalTransfer:false});
 }catch(error){
  if(error.code==='P0002')return fail(res,new HttpError(404,'Quote not found.'));
  if(error.code==='22023')return fail(res,new HttpError(409,'Quote, amount, account funds or business inventory unavailable. Refresh and request a new quote.'));
  return fail(res,error);
 }
}
