const { createBackup, waitForDatabase } = require('./backup');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function configuredIntervalSeconds() {
  const seconds = Number(process.env.BACKUP_INTERVAL_SECONDS || 86_400);
  if (!Number.isInteger(seconds) || seconds < 60) {
    throw new Error('BACKUP_INTERVAL_SECONDS deve ser um inteiro de pelo menos 60 segundos.');
  }
  return seconds;
}

async function run() {
  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath) throw new Error('DATABASE_PATH e obrigatorio para o processo de backup.');
  await waitForDatabase({ databasePath });
  const intervalMilliseconds = configuredIntervalSeconds() * 1000;
  while (true) {
    await createBackup({ databasePath });
    await delay(intervalMilliseconds);
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(JSON.stringify({ event: 'backup_daemon_failed', code: error.code || 'BACKUP_FAILED' }));
    process.exitCode = 1;
  });
}

module.exports = { configuredIntervalSeconds, run };
