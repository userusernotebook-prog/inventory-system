const { execFileSync } = require('node:child_process');

function normalizedPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isSensitivePath(filePath) {
  const value = normalizedPath(filePath).toLowerCase();
  if (value === '.env.example') return false;
  return (
    value === '.env' ||
    value.startsWith('.env.') ||
    value.endsWith('.pem') ||
    value.endsWith('.key') ||
    value.endsWith('.crt') ||
    value.endsWith('.db') ||
    value.endsWith('.db-wal') ||
    value.endsWith('.db-shm') ||
    value.startsWith('deploy/certs/') ||
    value.startsWith('external-backups/') ||
    value.startsWith('data/')
  );
}

function scanFiles(files) {
  const privateKey = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i;
  return files.flatMap((file) => {
    if (isSensitivePath(file.path)) return [{ path: file.path, reason: 'caminho sensivel' }];
    if (privateKey.test(Buffer.from(file.content).toString('utf8'))) {
      return [{ path: file.path, reason: 'chave privada no conteudo' }];
    }
    return [];
  });
}

function stagedFiles() {
  const paths = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .filter(Boolean);
  return paths.map((filePath) => ({
    path: filePath,
    content: execFileSync('git', ['show', `:${filePath}`])
  }));
}

function main() {
  const findings = scanFiles(stagedFiles());
  if (findings.length === 0) return;
  for (const finding of findings) {
    console.error(`Bloqueado: ${finding.path} (${finding.reason}).`);
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { isSensitivePath, scanFiles };
