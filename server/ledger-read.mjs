import {HttpError} from './core.mjs';
export async function readLedgerActivity(sql,userId,before=null){
 if(before!==null&&(typeof before!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(before)))throw new HttpError(400,'Invalid activity cursor.');
 // Aggregate only the customer's own liability lines. No custody accounts,
 // provider evidence, posting keys or another customer's split lines are exposed.
 const rows=await sql`WITH owned AS (
  SELECT e.journal_id,e.asset,(-sum(e.units))::text AS units,a.decimals
  FROM ledger_entries e JOIN ledger_accounts acc ON acc.id=e.account_id
  JOIN ledger_assets a ON a.code=e.asset
  WHERE acc.user_id=${userId} AND acc.kind='customer_liability'
  GROUP BY e.journal_id,e.asset,a.decimals
 ) SELECT j.id,j.created_at,(j.reverses IS NOT NULL) AS reversal,
 jsonb_agg(jsonb_build_object('asset',o.asset,'units',o.units,'decimals',o.decimals) ORDER BY o.asset) AS changes
 FROM ledger_journals j JOIN owned o ON o.journal_id=j.id
 WHERE (${before}::uuid IS NULL OR (j.created_at,j.id)<(
  SELECT c.created_at,c.id FROM ledger_journals c WHERE c.id=${before}::uuid
  AND EXISTS(SELECT 1 FROM owned visible WHERE visible.journal_id=c.id)
 )) GROUP BY j.id,j.created_at,j.reverses ORDER BY j.created_at DESC,j.id DESC LIMIT 31`;
 const entries=rows.slice(0,30);
 return {entries,nextCursor:rows.length>30?entries[entries.length-1].id:null,source:'ledger',notice:'Posted accounting entries, not trade confirmations, settlement guarantees or spendable balances.'};
}
