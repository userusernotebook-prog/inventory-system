const { createBackup, waitForDatabase } = require('./backup');
const { BackupConfigError, backupConfigProblems } = require('../src/config/backup-config');

// Código de saída padrão para erro de configuração (sysexits EX_CONFIG).
const CONFIG_ERROR_EXIT_CODE = 78;
const FIRST_RETRY_SECONDS = 60;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function configuredIntervalSeconds(environment = process.env) {
  const seconds = Number(environment.BACKUP_INTERVAL_SECONDS || 86_400);
  if (!Number.isInteger(seconds) || seconds < 60) {
    throw new BackupConfigError([
      'BACKUP_INTERVAL_SECONDS deve ser um inteiro de pelo menos 60 segundos.'
    ]);
  }
  return seconds;
}

// Após falhas seguidas espera 1, 2, 4, 8... minutos, sem passar do intervalo normal.
function retryDelaySeconds(consecutiveFailures, intervalSeconds) {
  return Math.min(intervalSeconds, FIRST_RETRY_SECONDS * 2 ** (consecutiveFailures - 1));
}

function logEvent(event) {
  console.log(JSON.stringify(event));
}

async function run({
  environment = process.env,
  backup = createBackup,
  sleep = delay,
  log = logEvent,
  iterations = Infinity
} = {}) {
  const problems = backupConfigProblems(environment);
  const databasePath = environment.DATABASE_PATH;
  if (!databasePath) problems.push('DATABASE_PATH e obrigatorio para o processo de backup.');
  if (problems.length) throw new BackupConfigError(problems);
  const intervalSeconds = configuredIntervalSeconds(environment);

  await waitForDatabase({ databasePath, sleep });
  let consecutiveFailures = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let success = false;
    try {
      const { status } = await backup({
        databasePath,
        backupDirectory: environment.BACKUP_DIR || undefined,
        externalDirectory: environment.BACKUP_EXTERNAL_DIR || undefined,
        ageRecipient: environment.AGE_RECIPIENT || undefined,
        monitorUrl: environment.BACKUP_MONITOR_URL || undefined,
        retentionDays: Number(environment.BACKUP_RETENTION_DAYS || 30)
      });
      success = status.success;
      log({ event: success ? 'backup_created' : 'backup_incomplete', errorCode: status.errorCode });
    } catch (error) {
      log({ event: 'backup_failed', code: error.code || 'BACKUP_FAILED' });
    }
    consecutiveFailures = success ? 0 : consecutiveFailures + 1;
    const waitSeconds = success
      ? intervalSeconds
      : retryDelaySeconds(consecutiveFailures, intervalSeconds);
    log({ event: 'backup_next_attempt', in_seconds: waitSeconds, consecutiveFailures });
    await sleep(waitSeconds * 1000);
  }
}

if (require.main === module) {
  require('../src/config/load-env').loadEnv();
  run().catch((error) => {
    const configError = error instanceof BackupConfigError;
    console.error(
      JSON.stringify({
        event: configError ? 'backup_daemon_config_invalid' : 'backup_daemon_failed',
        code: error.code || 'BACKUP_FAILED',
        message: error.message
      })
    );
    process.exitCode = configError ? CONFIG_ERROR_EXIT_CODE : 1;
  });
}

module.exports = { configuredIntervalSeconds, retryDelaySeconds, run };
