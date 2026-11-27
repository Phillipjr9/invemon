import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const servers=[],controller=new AbortController();
async function serve(port,mode){
 const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0','--port',String(port),'--strictPort'],{stdio:'inherit',env:{...process.env,VITE_ACCOUNT_MODE:mode}});servers.push(server);
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Browser test server exited');
  try{if((await fetch(base)).ok)return base;}catch{/* Wait for Vite. */}
  await setTimeout(100);
 }
 throw new Error('Browser test server did not become ready');
}
async function run(file,env){
 const child=spawn(process.execPath,[`scripts/${file}`],{stdio:'inherit',env:{...process.env,...env},signal:controller.signal});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 if(code!==0)throw new Error(`${file} failed (${code})`);
}
try{
 const base=await serve(5186,'demo');
 for(const file of ['verify-asset-logos.mjs','verify-market-charts.mjs','verify-dashboard-editorial.mjs'])await run(file,{TEST_BASE_URL:base});
 const serverBase=await serve(5187,'server');
 for(const file of ['verify-server-accounts.mjs','verify-account-links-ui.mjs','verify-support.mjs'])await run(file,{SERVER_TEST_BASE_URL:serverBase});
}finally{controller.abort();for(const server of servers)server.kill('SIGTERM');}
