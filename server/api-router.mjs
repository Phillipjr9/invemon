import {headers,HttpError,fail} from './core.mjs';
// Dispatch only exact, allowlisted paths. No dynamic import from request input,
// no redirect/rewrite of the body, and no shared authorization assumptions.
export function createApiRouter(routes){
 const handlers=new Map(Object.entries(routes).map(([name,handler])=>[`/api/${name}`,handler]));
 return async function router(req,res){
  try{
   const raw=req.url||'';
   if(!raw.startsWith('/')||raw.startsWith('//'))throw new HttpError(404,'API endpoint not found.');
   const url=new URL(raw,'https://internal.invalid');
   const handler=handlers.get(url.pathname);
   if(!handler)throw new HttpError(404,'API endpoint not found.');
   // Derive query parameters from the original URL, not the catch-all path
   // parameter Vercel adds. Repeated keys retain the usual array semantics.
   const query=Object.create(null);
   for(const key of new Set(url.searchParams.keys())){
    const values=url.searchParams.getAll(key);query[key]=values.length===1?values[0]:values;
   }
   req.query=query;
   return await handler(req,res);
  }catch(error){headers(res);return fail(res,error);}
 };
}
