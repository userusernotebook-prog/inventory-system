const fs = require('node:fs');
const path = require('node:path');

const criticalFiles = Object.freeze([
  'src/modules/auth/auth.service.js',
  'src/modules/approvals/approvals.service.js',
  'src/modules/movements/movements.service.js',
  'src/modules/assignments/assignments.service.js',
  'src/modules/assets/domain/asset-state-machine.js'
]);

const requiredMetrics = Object.freeze(['lines', 'branches']);
const minimumCoverage = 80;

function normalize(file) {
  return file.replaceAll('\\', '/');
}

function findCoverageEntry(summary, expectedFile) {
  return Object.entries(summary).find(([file]) => normalize(file).endsWith(expectedFile))?.[1];
}

function checkCriticalCoverage(summary) {
  const failures = [];
  const results = criticalFiles.map((file) => {
    const entry = findCoverageEntry(summary, file);
    const metrics = Object.fromEntries(
      requiredMetrics.map((metric) => [metric, entry?.[metric]?.pct ?? 0])
    );
    for (const [metric, percentage] of Object.entries(metrics)) {
      if (percentage < minimumCoverage) {
        failures.push(`${file}: ${metric} ${percentage}% (mínimo ${minimumCoverage}%)`);
      }
    }
    return { file, ...metrics };
  });
  if (failures.length) {
    throw new Error(`Cobertura crítica insuficiente:\n${failures.join('\n')}`);
  }
  return results;
}

function main(summaryFile) {
  const file = path.resolve(summaryFile || 'coverage/coverage-summary.json');
  const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
  const results = checkCriticalCoverage(summary);
  for (const result of results) {
    console.log(`${result.file}: linhas ${result.lines}%, branches ${result.branches}%`);
  }
}

if (require.main === module) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { checkCriticalCoverage, criticalFiles, findCoverageEntry, minimumCoverage };
