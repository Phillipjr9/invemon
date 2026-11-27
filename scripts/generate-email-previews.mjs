import fs from 'node:fs';
import { renderEmail, EMAIL_TYPES } from '../server/email-templates.mjs';
const directory=new URL('../public/email-preview/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
for(const type of EMAIL_TYPES){
 const output=renderEmail(type,{name:'Alex Morgan',occurredAt:'2026-11-27T12:30:00Z',reference:type==='support_received'?'SAMPLE-7E2A':type==='workspace_saved'?'Demo revision 4':''},'https://invemon.example');
 // Local static specimens only: real delivery always uses the configured HTTPS origin.
 const html=output.html.replaceAll('https://invemon.example/assets/','/assets/').replaceAll('href="https://invemon.example/#dashboard"','href="/#dashboard"');
 fs.writeFileSync(new URL(`${type}.html`,directory),html);
 fs.writeFileSync(new URL(`${type}.txt`,directory),output.text);
}
console.log('Generated six fictional email specimens. No emails sent.');
