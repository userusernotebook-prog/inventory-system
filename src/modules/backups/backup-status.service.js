const fs = require('node:fs');
const path = require('node:path');

function createBackupStatusService({ backupDirectory, fileSystem = fs }) {
  const statusPath = path.join(backupDirectory, 'backup-status.json');
  return {
    getLatest() {
      if (!fileSystem.existsSync(statusPath)) return { latestSuccessful: null, lastAttempt: null };
      try {
        const lastAttempt = JSON.parse(fileSystem.readFileSync(statusPath, 'utf8'));
        return { latestSuccessful: lastAttempt.success ? lastAttempt : null, lastAttempt };
      } catch {
        return { latestSuccessful: null, lastAttempt: null };
      }
    }
  };
}

module.exports = { createBackupStatusService };
