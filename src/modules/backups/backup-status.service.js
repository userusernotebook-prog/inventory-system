const fs = require('node:fs');
const path = require('node:path');

function createBackupStatusService({ backupDirectory, fileSystem = fs }) {
  const statusPath = path.join(backupDirectory, 'backup-status.json');
  return {
    getLatest() {
      if (!fileSystem.existsSync(statusPath)) return { latestSuccessful: null, lastAttempt: null };
      try {
        const lastAttempt = JSON.parse(fileSystem.readFileSync(statusPath, 'utf8'));
        // Cada tentativa registra suas etapas; o último backup completo é preservado à parte.
        const latestSuccessful =
          lastAttempt.lastSuccessful || (lastAttempt.success ? lastAttempt : null);
        return { latestSuccessful, lastAttempt };
      } catch {
        return { latestSuccessful: null, lastAttempt: null };
      }
    }
  };
}

module.exports = { createBackupStatusService };
