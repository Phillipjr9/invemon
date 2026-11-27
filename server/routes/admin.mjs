import {db,headers,guard,session,body,HttpError,fail,rateLimit,checkPassword,randomUUID} from '../core.mjs';
import {requireFundingAdmin} from '../funding.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req);requireFundingAdmin(user);
  await rateLimit(req,`admin-${user.id}`,req.method==='GET'?120:20);const sql=db();
  if(req.method==='GET'){
   const view=req.query?.view||'queue';
   if(view==='customers'){
    const search=String(req.query?.search||'').trim();if(search.length<3||search.length>100)throw new HttpError(400,'Search using 3–100 characters of an email or account ID.');
    const customers=await sql`SELECT id,email,email_verified_at,created_at FROM app_users WHERE strpos(lower(email),lower(${search}))>0 OR id::text=${search} ORDER BY created_at DESC,id DESC LIMIT 30`;
    return res.status(200).json({customers,limit:30});
   }
   if(view==='account'){
    const id=req.query?.id;if(typeof id!=='string'||!uuid.test(id))throw new HttpError(400,'Invalid account ID.');
    const customers=await sql`SELECT id,email,email_verified_at,created_at FROM app_users WHERE id=${id}`;
    if(!customers.length)throw new HttpError(404,'Account not found.');
    const balances=await sql`SELECT b.asset,b.total_units,b.reserved_units,b.available_units,a.decimals FROM ledger_spendable_balances b JOIN ledger_assets a ON a.code=b.asset WHERE b.user_id=${id} ORDER BY b.asset`;
    return res.status(200).json({customer:customers[0],balances});
   }
   if(view==='history'){
    const id=req.query?.id;if(typeof id!=='string'||!uuid.test(id))throw new HttpError(400,'Invalid reservation ID.');
    const events=await sql`SELECT id,reservation_id,revision,actor_id,decision,note,created_at FROM admin_review_events WHERE reservation_id=${id} ORDER BY revision DESC LIMIT 50`;
    return res.status(200).json({events,limit:50});
   }
   if(view!=='queue')throw new HttpError(400,'Invalid admin view.');
   const requests=await sql`SELECT r.id,r.user_id,u.email,r.asset,r.units::text,a.decimals,r.state,r.created_at,d.label AS destination_label,d.masked AS destination_masked,d.kind AS destination_kind,coalesce(e.revision,0) AS revision,coalesce(e.decision,'pending') AS decision
    FROM fund_reservation_states r LEFT JOIN withdrawal_requests w ON w.id=r.id LEFT JOIN withdrawal_destinations d ON d.id=w.destination_id JOIN app_users u ON u.id=r.user_id JOIN ledger_assets a ON a.code=r.asset
    LEFT JOIN LATERAL(SELECT revision,decision FROM admin_review_events WHERE reservation_id=r.id ORDER BY revision DESC LIMIT 1)e ON true
    WHERE r.purpose='withdrawal' ORDER BY r.created_at DESC,r.id DESC LIMIT 100`;
   return res.status(200).json({requests,limit:100,payoutsEnabled:false});
  }
  const input=body(req);if(input.action!=='review')throw new HttpError(400,'Unsupported admin action.');
  if(typeof input.id!=='string'||!uuid.test(input.id)||!Number.isInteger(input.revision)||input.revision<0||!['reviewing','approved','rejected'].includes(input.decision)||typeof input.note!=='string'||input.note.trim().length<1||input.note.length>2000)throw new HttpError(400,'Provide a request, revision, decision and a note of 1–2,000 characters.');
  if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password for this admin action.');
  try{
   const result=await sql`SELECT admin_review_withdrawal(${randomUUID()}::uuid,${input.id}::uuid,${user.id}::uuid,${input.revision},${input.decision},${input.note.trim()}) AS revision`;
   return res.status(200).json({revision:result[0].revision,payoutInitiated:false});
  }catch(error){
   if(error.code==='40001')throw new HttpError(409,'This request changed or is no longer held. Reload before reviewing.');
   if(error.code==='P0002')throw new HttpError(404,'Withdrawal request not found.');
   throw error;
  }
 }catch(error){return fail(res,error);}
}
