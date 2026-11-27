import {db,headers,guard,session,body,HttpError,fail,rateLimit,randomUUID} from '../core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cents(value,positive=false){
 if(typeof value!=='string'||!/^\d{1,24}(\.\d{1,2})?$/.test(value))throw new HttpError(400,'Use a USD planning amount with up to two decimal places.');
 const [whole,fraction='']=value.split('.');const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(positive&&n===0n)throw new HttpError(400,'Target must be greater than zero.');return n.toString();
}
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();await rateLimit(req,`goals-${user.id}`,req.method==='GET'?120:30);
  if(req.method==='GET'){
   const goals=await sql`SELECT id,name,target_cents::text,monthly_cents::text,target_date::text,archived,revision,created_at,updated_at FROM customer_goals WHERE user_id=${user.id} ORDER BY updated_at DESC,id DESC LIMIT 100`;
   return res.status(200).json({goals,limit:100,progressAvailable:false});
  }
  const input=body(req);if(!['create','update','archive','restore'].includes(input.action)||typeof input.id!=='string'||!uuid.test(input.id))throw new HttpError(400,'Provide a valid goal ID and action.');
  if(input.action==='create'||input.action==='update'){
   const name=typeof input.name==='string'?input.name.trim():'';
   if(!name||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw new HttpError(400,'Use a goal name of 1–100 characters.');
   const target=cents(input.target,true),monthly=cents(input.monthly);
   const date=input.targetDate;
   if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<new Date().toISOString().slice(0,10)||date>'2199-12-31')throw new HttpError(400,'Choose a valid target date from today through 2199.');
   if(input.action==='create'){
    const created=await sql`WITH saved AS(INSERT INTO customer_goals(id,user_id,name,target_cents,monthly_cents,target_date) VALUES(${input.id},${user.id},${name},${target},${monthly},${date}::date) ON CONFLICT(id) DO NOTHING RETURNING id,revision), logged AS(INSERT INTO customer_goal_events(id,goal_id,user_id,revision,action) SELECT ${randomUUID()},id,${user.id},revision,'created' FROM saved) SELECT id,revision FROM saved`;
    if(created.length)return res.status(201).json({goal:created[0]});
    // A retry of the original, unchanged creation is safe; never expose foreign IDs.
    const existing=await sql`SELECT id,revision FROM customer_goals WHERE id=${input.id} AND user_id=${user.id} AND revision=1 AND name=${name} AND target_cents=${target}::numeric AND monthly_cents=${monthly}::numeric AND target_date=${date}::date AND NOT archived`;
    if(existing.length)return res.status(200).json({goal:existing[0]});
    throw new HttpError(409,'This goal request already exists with different details. Refresh your goals.');
   }
   if(!Number.isInteger(input.revision)||input.revision<1)throw new HttpError(400,'Provide the current goal revision.');
   const changed=await sql`WITH saved AS(UPDATE customer_goals SET name=${name},target_cents=${target},monthly_cents=${monthly},target_date=${date}::date,revision=revision+1,updated_at=now() WHERE id=${input.id} AND user_id=${user.id} AND revision=${input.revision} AND NOT archived RETURNING id,revision), logged AS(INSERT INTO customer_goal_events(id,goal_id,user_id,revision,action) SELECT ${randomUUID()},id,${user.id},revision,'updated' FROM saved) SELECT id,revision FROM saved`;
   if(!changed.length)throw new HttpError(409,'Goal changed, was archived, or is unavailable. Refresh before editing.');
   return res.status(200).json({goal:changed[0]});
  }
  if(!Number.isInteger(input.revision)||input.revision<1)throw new HttpError(400,'Provide the current goal revision.');
  const archived=input.action==='archive';
  const changed=await sql`WITH saved AS(UPDATE customer_goals SET archived=${archived},revision=revision+1,updated_at=now() WHERE id=${input.id} AND user_id=${user.id} AND revision=${input.revision} AND archived<>${archived} RETURNING id,revision), logged AS(INSERT INTO customer_goal_events(id,goal_id,user_id,revision,action) SELECT ${randomUUID()},id,${user.id},revision,${archived?'archived':'restored'} FROM saved) SELECT id,revision FROM saved`;
  if(!changed.length)throw new HttpError(409,'Goal changed or is unavailable. Refresh before acting.');
  return res.status(200).json({goal:changed[0]});
 }catch(error){return fail(res,error);}
}
