const AGE_RECIPIENT = /^age1[0-9a-z]{20,}$/;

// Erros de configuração não se resolvem tentando de novo: a aplicação e o
// serviço de backup recusam iniciar em vez de entrar em loop.
class BackupConfigError extends Error {
  constructor(problems) {
    super(`Configuração de backup inválida: ${problems.join(' ')}`);
    this.name = 'BackupConfigError';
    this.code = 'BACKUP_CONFIG_INVALID';
    this.problems = problems;
  }
}

function filled(value) {
  return String(value ?? '').trim();
}

function backupConfigProblems(environment = process.env) {
  const problems = [];
  const externalDirectory = filled(environment.BACKUP_EXTERNAL_DIR);
  const recipient = filled(environment.AGE_RECIPIENT);
  if (externalDirectory && !recipient) {
    problems.push(
      'BACKUP_EXTERNAL_DIR está definido, mas AGE_RECIPIENT está vazio: a cópia externa é cifrada com age e exige a chave pública (age1...).'
    );
  }
  if (recipient && !AGE_RECIPIENT.test(recipient)) {
    problems.push('AGE_RECIPIENT deve ser uma chave pública age, começando com age1.');
  }
  const retention = filled(environment.BACKUP_RETENTION_DAYS);
  if (retention && (!/^\d+$/.test(retention) || Number(retention) < 1)) {
    problems.push('BACKUP_RETENTION_DAYS deve ser um inteiro maior ou igual a 1.');
  }
  const interval = filled(environment.BACKUP_INTERVAL_SECONDS);
  if (interval && (!/^\d+$/.test(interval) || Number(interval) < 60)) {
    problems.push('BACKUP_INTERVAL_SECONDS deve ser um inteiro de pelo menos 60 segundos.');
  }
  return problems;
}

function assertBackupConfig(environment = process.env) {
  const problems = backupConfigProblems(environment);
  if (problems.length) throw new BackupConfigError(problems);
}

module.exports = { BackupConfigError, assertBackupConfig, backupConfigProblems };
