const { execSync } = require('child_process');
let raw;
try {
  raw = execSync(
    'pnpm exec eslint --format json src/',
    { cwd: 'C:/DEV/Futuragest/backend', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
} catch (e) {
  raw = e.stdout || '';
}
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const idx = raw.indexOf('[');
if (idx < 0) { console.log('No JSON found:', raw.slice(0, 500)); process.exit(1); }
const results = JSON.parse(raw.slice(idx));
let totalWarnings = 0;
let totalErrors = 0;
for (const f of results) {
  if (f.messages.length) {
    const short = f.filePath.replace(/.*\\src\\/, 'src/').replace(/\\/g, '/');
    console.log('\n---', short);
    for (const m of f.messages) {
      const type = m.severity === 2 ? 'ERROR' : 'WARN';
      console.log(`  L${m.line}: [${m.ruleId}] ${m.message.slice(0, 90)}`);
      if (m.severity === 2) totalErrors++;
      else totalWarnings++;
    }
  }
}
console.log(`\nTotal: ${totalErrors} errors, ${totalWarnings} warnings`);
