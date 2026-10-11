const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkCriticalCoverage,
  criticalFiles,
  minimumCoverage
} = require('../../../scripts/check-critical-coverage');

function completeSummary({ lines = 80, branches = 80 } = {}) {
  return Object.fromEntries(
    criticalFiles.map((file) => [
      `C:/workspace/${file}`,
      { lines: { pct: lines }, branches: { pct: branches } }
    ])
  );
}

test('a verificacao exige 80% de linhas e branches em cada arquivo crítico', () => {
  const accepted = checkCriticalCoverage(completeSummary());
  assert.equal(accepted.length, criticalFiles.length);

  const belowLines = completeSummary({ lines: minimumCoverage - 1 });
  assert.throws(() => checkCriticalCoverage(belowLines), /lines 79%/);

  const belowBranches = completeSummary({ branches: minimumCoverage - 1 });
  assert.throws(() => checkCriticalCoverage(belowBranches), /branches 79%/);
});
