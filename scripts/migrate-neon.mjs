import fs from 'node:fs';
import {neon} from '@neondatabase/serverless';
import {sqlStatements} from '../server/sql-statements.mjs';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in your shell (never a VITE_ variable).');
const sql=neon(process.env.DATABASE_URL);
const directory=new URL('../db/',import.meta.url);
const files=fs.readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const statements=files.flatMap(file=>sqlStatements(fs.readFileSync(new URL(file,directory),'utf8')));
// Reapplication of an older function must not temporarily remove newer fund
// guards. Publish the complete numbered schema atomically, not file by file.
await sql.transaction(statements.map(statement=>sql.query(statement)));
for(const file of files)console.log(`Applied ${file}`);
console.log('Neon schemas applied atomically. Live-money services remain disabled.');
