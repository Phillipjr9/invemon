// Split PostgreSQL migration scripts without breaking quoted function bodies.
export function sqlStatements(source) {
 const result=[]; let start=0, i=0, quote=null, dollar=null, comment=0;
 while(i<source.length){
  const pair=source.slice(i,i+2), c=source[i];
  if(comment===-1){if(c==='\n')comment=0;i++;continue;}
  if(comment>0){if(pair==='/*'){comment++;i+=2;}else if(pair==='*/'){comment--;i+=2;}else i++;continue;}
  if(dollar){if(source.startsWith(dollar,i)){i+=dollar.length;dollar=null;}else i++;continue;}
  if(quote){if(c===quote){if(source[i+1]===quote)i+=2;else{quote=null;i++;}}else i++;continue;}
  if(pair==='--'){comment=-1;i+=2;continue;}if(pair==='/*'){comment=1;i+=2;continue;}
  if(c==="'"||c==='"'){quote=c;i++;continue;}
  const tag=c==='$'&&source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
  if(tag){dollar=tag;i+=tag.length;continue;}
  if(c===';'){const s=source.slice(start,i).trim();if(s)result.push(s);start=i+1;}i++;
 }
 if(quote||dollar||comment>0)throw new Error('Unterminated SQL quote or comment');
 const tail=source.slice(start).trim();if(tail && tail.replace(/--[^\n]*/g,'').trim())result.push(tail);
 return result;
}
