import {attemptUserNotifications} from '../notifications.mjs';
import {db,headers,guard,session,body,HttpError,fail,rateLimit,checkPassword,randomUUID} from '../core.mjs';
import {destinationEncryptionConfigured,validateDestination,encryptDestination,atomicWithdrawalAmount} from '../withdrawals.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();await rateLimit(req,`withdrawals-${user.id}`,req.method==='GET'?120:20);
  if(req.method==='GET'){
   const destinations=await sql`SELECT id,kind,asset,label,masked,created_at FROM withdrawal_destinations WHERE user_id=${user.id} ORDER BY created_at DESC,id DESC LIMIT 100`;
   const requests=await sql`SELECT w.id,w.asset,r.units::text,a.decimals,r.state,r.reason,w.created_at,d.label,d.masked,coalesce(e.decision,'pending') AS decision
    FROM withdrawal_requests w JOIN fund_reservation_states r ON r.id=w.id JOIN withdrawal_destinations d ON d.id=w.destination_id JOIN ledger_assets a ON a.code=w.asset
    LEFT JOIN LATERAL(SELECT decision FROM admin_review_events WHERE reservation_id=w.id ORDER BY revision DESC LIMIT 1)e ON true
    WHERE w.user_id=${user.id} ORDER BY w.created_at DESC,w.id DESC LIMIT 100`;
   const accounts=await sql`SELECT b.id,b.asset,b.total_units,b.reserved_units,b.available_units,a.decimals FROM ledger_spendable_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${user.id} ORDER BY b.asset`;
   return res.status(200).json({destinations,requests,accounts,submissionEnabled:process.env.WITHDRAWALS_ENABLED==='true'&&destinationEncryptionConfigured(),destinationStorageEnabled:destinationEncryptionConfigured(),limit:100});
  }
  if(!user.email_verified_at||!user.mfa_secret||!user.mfa_verified)throw new HttpError(403,'Verified email and an MFA-verified session are required.');
  const input=body(req);if(!['save-destination','request','cancel'].includes(input.action))throw new HttpError(400,'Unsupported withdrawal action.');
  if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password.');
  if(input.action==='save-destination'){
   const destination=validateDestination(input);
   const assets=await sql`SELECT code FROM ledger_assets WHERE code=${destination.asset}`;if(!assets.length)throw new HttpError(400,'Unsupported asset/network.');
   const id=randomUUID(),encrypted=encryptDestination(destination.details,user.id,id);
   await sql`WITH saved AS(INSERT INTO withdrawal_destinations(id,user_id,kind,asset,label,masked,encrypted_details) VALUES(${id},${user.id},${destination.kind},${destination.asset},${destination.label},${destination.masked},${encrypted}) RETURNING id)
    INSERT INTO security_events(id,user_id,action) SELECT ${randomUUID()},${user.id},'withdrawal.destination_saved' FROM saved`;
   return res.status(201).json({id});
  }
  if(typeof input.id!=='string'||!uuid.test(input.id))throw new HttpError(400,'Invalid request or destination ID.');
  if(input.action==='cancel'){
   await sql`SELECT cancel_customer_withdrawal(${input.id}::uuid,${user.id}::uuid)`;await attemptUserNotifications(user.id);return res.status(200).json({cancelled:true});
  }
  if(process.env.WITHDRAWALS_ENABLED!=='true'||!destinationEncryptionConfigured())throw new HttpError(503,'Withdrawal submission is not enabled.');
  if(typeof input.requestKey!=='string'||!uuid.test(input.requestKey))throw new HttpError(400,'Provide a stable request key.');
  const rows=await sql`SELECT b.id,a.decimals FROM withdrawal_destinations d JOIN ledger_spendable_balances b ON b.user_id=d.user_id AND b.asset=d.asset JOIN ledger_assets a ON a.code=d.asset WHERE d.id=${input.id} AND d.user_id=${user.id}`;
  if(rows.length!==1)throw new HttpError(400,'Destination or matching balance account is unavailable.');
  const units=atomicWithdrawalAmount(input.amount,rows[0].decimals);
  const result=await sql`SELECT request_customer_withdrawal(${randomUUID()}::uuid,${user.id}::uuid,${rows[0].id}::uuid,${input.id}::uuid,${units},${input.requestKey}) AS id`;
  await attemptUserNotifications(user.id);
  return res.status(201).json({id:result[0].id,payoutInitiated:false});
 }catch(error){
  if(error.code==='40001')return fail(res,new HttpError(409,'Request changed or can no longer be cancelled. Refresh its status.'));
  if(error.code==='P0002')return fail(res,new HttpError(404,'Withdrawal or destination not found.'));
  if(error.code==='22023'||error.message?.includes('different contents')||error.message?.includes('different destination'))return fail(res,new HttpError(409,'This request key was already used with different details.'));
  if(error.message?.includes('Insufficient'))return fail(res,new HttpError(409,'Insufficient unreserved funds.'));
  return fail(res,error);
 }
}
