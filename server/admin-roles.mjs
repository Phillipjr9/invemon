import {HttpError} from './core.mjs';
const includes=(name,id)=>(process.env[name]||'').split(',').map(value=>value.trim()).filter(Boolean).includes(id);
export function adminRole(user){
 if(!user?.id)return null;
 if(includes('SUPER_ADMIN_IDS',user.id))return 'super_admin';
 if(includes('FUNDING_ADMIN_IDS',user.id))return 'admin';
 return null;
}
export function requireAdmin(user,{superOnly=false}={}){
 const role=adminRole(user);
 if(!role||!user.email_verified_at||!user.mfa_secret||!user.mfa_verified)throw new HttpError(403,'Administration requires an authorized role, verified email and an MFA-verified session.');
 if(superOnly&&role!=='super_admin')throw new HttpError(403,'This action requires Super Admin permission.');
 return role;
}
