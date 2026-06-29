const fs = require('fs');
let raw = fs.readFileSync('C:/DEV/Futuragest/backend/lint-clean.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const results = JSON.parse(raw);
const ruleCounts = {};
const fileWarnings = {};
const fileMessages = {};
let totalWarnings = 0;
let totalErrors = 0;
for (const file of results) {
  const parts = file.filePath.split('backend');
  const shortName = (parts[1] || file.filePath).replace(/\\/g, '/').replace(/^[\\/]/, '');
  for (const msg of file.messages) {
    if (msg.severity === 1) {
      totalWarnings++;
      ruleCounts[msg.ruleId] = (ruleCounts[msg.ruleId] || 0) + 1;
      if (!fileWarnings[shortName]) fileWarnings[shortName] = {};
      fileWarnings[shortName][msg.ruleId] = (fileWarnings[shortName][msg.ruleId] || 0) + 1;
      if (!fileMessages[shortName]) fileMessages[shortName] = [];
      fileMessages[shortName].push({ rule: msg.ruleId, line: msg.line, msg: msg.message });
    } else if (msg.severity === 2) {
      totalErrors++;
    }
  }
}
console.log('=== TOTALS ===');
console.log('Errors:', totalErrors, '| Warnings:', totalWarnings);
console.log('\n=== BY RULE ===');
Object.entries(ruleCounts).sort((a,b) => b[1]-a[1]).forEach(([rule, count]) => {
  console.log(count.toString().padStart(4), rule);
});
console.log('\n=== FILES WITH WARNINGS ===');
Object.entries(fileWarnings).sort((a,b) => {
  const ca = Object.values(a[1]).reduce((s,v)=>s+v,0);
  const cb = Object.values(b[1]).reduce((s,v)=>s+v,0);
  return cb - ca;
}).forEach(([file, rules]) => {
  const total = Object.values(rules).reduce((s,v)=>s+v,0);
  console.log(total.toString().padStart(4), file, JSON.stringify(rules));
});
// Save full messages for detailed inspection
fs.writeFileSync('C:/DEV/Futuragest/backend/lint-messages.json', JSON.stringify(fileMessages, null, 2));
console.log('\nDetailed messages saved to lint-messages.json');
