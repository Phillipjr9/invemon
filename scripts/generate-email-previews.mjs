import fs from 'node:fs';
import { renderEmail, EMAIL_TEMPLATE_TYPES } from '../server/email-templates.mjs';
const directory=new URL('../.email-previews/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
for(const type of EMAIL_TEMPLATE_TYPES){
 const output=renderEmail(type,{name:'Alex Morgan',token:'0'.repeat(64),occurredAt:'2026-11-27T12:30:00Z',reference:type==='support_received'?'SAMPLE-7E2A':type==='workspace_saved'?'Demo revision 4':''},'https://invemon.example');
 // Local static specimens only: real delivery always uses the configured HTTPS origin.
 const html=output.html.replaceAll('https://invemon.example/assets/','/assets/').replaceAll('href="https://invemon.example/#dashboard"','href="/#dashboard"');
 fs.writeFileSync(new URL(`${type}.html`,directory),html.replace(/href="https:\/\/invemon\.example\/#(?:verify|reset)\?token=[a-f0-9]+"/g,'href="/#emails"'));
 fs.writeFileSync(new URL(`${type}.txt`,directory),output.text);
}
console.log('Generated eight fictional email specimens. No emails sent.');
