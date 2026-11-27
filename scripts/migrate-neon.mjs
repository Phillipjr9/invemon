import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in your shell (never a VITE_ variable).');
const sql=neon(process.env.DATABASE_URL);
const directory=new URL('../db/',import.meta.url);
for(const file of fs.readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) {
 const migration=fs.readFileSync(new URL(file,directory),'utf8');
 await sql.transaction(migration.split(';').map(s=>s.replace(/--[^\n]*/g,'').trim()).filter(Boolean).map(s=>sql.query(s)));
 console.log(`Applied ${file}`);
}
console.log('Neon schemas applied. Live-money services remain disabled.');
