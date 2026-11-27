import { headers,guard,session,body,fail } from '../core.mjs';
import { manageMfa } from '../mfa.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['POST']);const user=await session(req);
  return res.status(200).json(await manageMfa(req,res,user,body(req)));
 }catch(error){return fail(res,error);}
}
