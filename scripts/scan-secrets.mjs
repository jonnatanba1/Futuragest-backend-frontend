import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);

const findings = [];
const safeValue =
  /(?:example|placeholder|change[_-]?me|not-for-production|localhost|127\.0\.0\.1|test|dummy|fake|minioadmin|\$\{|^\$)/i;
const excludedPath =
  /(?:^|\/)(?:\.agents|\.claude)(?:\/|$)|(?:^|\/)(?:lint-clean|lint-output)\.json$|^\.github\/workflows\/ci\.yml$/;

function report(file, line, rule) {
  findings.push({ file, line, rule });
}

for (const file of files) {
  if (excludedPath.test(file.replaceAll('\\', '/'))) continue;
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }

  if (buffer.includes(0)) continue;
  const lines = buffer.toString('utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) {
      report(file, lineNumber, 'private-key');
    }
    if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(line)) {
      report(file, lineNumber, 'aws-access-key');
    }
    if (/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/.test(line)) {
      report(file, lineNumber, 'github-token');
    }
    if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(line)) {
      report(file, lineNumber, 'jwt');
    }

    const databaseUrl = line.match(/postgres(?:ql)?:\/\/([^\s`"']+)/i)?.[0];
    if (databaseUrl && !safeValue.test(databaseUrl)) {
      try {
        const parsed = new URL(databaseUrl);
        if (!['postgres', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
          report(file, lineNumber, 'database-url');
        }
      } catch {
        report(file, lineNumber, 'database-url');
      }
    }

    const assignment = line.match(
      /^\s*(?:JWT_SECRET|MINIO_(?:ROOT_)?PASSWORD|POSTGRES_PASSWORD|DATABASE_URL)\s*[:=]\s*["']?([^\s"']+)/i,
    );
    if (assignment && !safeValue.test(assignment[1])) {
      report(file, lineNumber, 'sensitive-assignment');
    }
  });
}

if (findings.length > 0) {
  console.error('Potential secrets detected. Values are intentionally redacted:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked/unignored files checked).`);
