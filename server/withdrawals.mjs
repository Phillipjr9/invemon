import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {HttpError} from './core.mjs';
export const destinationEncryptionConfigured=()=>/^[a-f0-9]{64}$/i.test(process.env.WITHDRAWAL_ENCRYPTION_KEY||'');
const key=()=>{if(!destinationEncryptionConfigured())throw new HttpError(503,'Destination storage is not configured.');return Buffer.from(process.env.WITHDRAWAL_ENCRYPTION_KEY,'hex');};
export function encryptDestination(details,userId,id){
 return seal(details,userId,id);
}
function seal(details,userId,id){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(`withdrawal:${userId}:${id}`));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(details),'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function decryptDestination(value,userId,id){
 try{const [version,iv,tag,data]=value.split('.');if(version!=='v1')throw new Error();const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(`withdrawal:${userId}:${id}`));cipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8'));}catch{throw new HttpError(503,'Destination details unavailable.');}
}
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(value)?value.trim():null;
export function validateDestination(input){
 const label=text(input.label,80),asset=text(input.asset,80),kind=input.kind;if(!label||!asset||!['ach','wire','crypto'].includes(kind))throw new HttpError(400,'Provide a label, supported asset and destination method.');
 if(kind==='crypto'){
  const address=text(input.address,180),memo=typeof input.memo==='string'?input.memo.trim():'';
  if(!address||!/^[A-Za-z0-9:._-]{10,180}$/.test(address)||memo.length>120||/[\x00-\x1f\x7f]/.test(memo)||asset.startsWith('USD:')||!asset.includes(':'))throw new HttpError(400,'Provide a crypto asset/network, address and optional memo.');
  return {label,asset,kind,masked:`${asset} · …${address.slice(-6)}`,details:{address,memo}};
 }
 const holder=text(input.holder,100),bankName=text(input.bankName,100),routing=String(input.routing||''),account=String(input.account||'');
 const sum=/^\d{9}$/.test(routing)?[3,7,1,3,7,1,3,7,1].reduce((n,w,i)=>n+w*Number(routing[i]),0):0;
 if(asset!=='USD:BANK'||!holder||!bankName||!/^\d{9}$/.test(routing)||/^0+$/.test(routing)||sum%10!==0||!/^\d{4,17}$/.test(account)||!['checking','savings'].includes(input.accountType))throw new HttpError(400,'Provide valid US bank details, routing checksum, account type and USD:BANK asset.');
 return {label,asset,kind,masked:`${kind.toUpperCase()} · …${account.slice(-4)}`,details:{holder,bankName,routing,account,accountType:input.accountType}};
}
export function atomicWithdrawalAmount(amount,decimals){
 if(typeof amount!=='string'||!/^\d{1,48}(\.\d{1,30})?$/.test(amount))throw new HttpError(400,'Enter a positive decimal amount without commas.');
 const [whole,fraction='']=amount.split('.');if(fraction.length>decimals)throw new HttpError(400,'Amount has too many decimal places for this asset.');
 const units=BigInt(whole+fraction.padEnd(decimals,'0'));if(units<=0n||units>=10n**78n)throw new HttpError(400,'Amount is outside the supported range.');return units.toString();
}
