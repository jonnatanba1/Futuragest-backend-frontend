const fs = require('fs');
let raw = fs.readFileSync('C:/DEV/Futuragest/backend/partial-lint.json','utf8');
if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const s=raw.indexOf('['), e=raw.lastIndexOf(']');
const results=JSON.parse(raw.substring(s,e+1));
let w=0, err=0;
for(const f of results){
  const parts = f.filePath.split('backend');
  const short = (parts[1] || f.filePath).replace(/\\/g,'/');
  for(const m of f.messages){
    if(m.severity===2){err++;console.log('ERROR L'+m.line, short, m.message);}
    if(m.severity===1){w++;console.log('WARN L'+m.line, short, m.ruleId, m.message);}
  }
}
console.log('Total: errors='+err+' warnings='+w);
