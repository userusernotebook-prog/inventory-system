const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore'
  });
} catch {
  // Instalações fora de um clone Git, como imagens Docker, não usam hooks.
}
