function validate(runs, outcomesOnly = false) {
  const ids = new Set();
  for (const run of runs) {
    if (typeof run.taskId !== 'string' || !run.taskId || ids.has(run.taskId) ||
        ![true, false, null].includes(run.passed)) throw new Error('Invalid or duplicate evaluation run');
    ids.add(run.taskId);
    if (!outcomesOnly && (![true, false, null].includes(run.safe) ||
        ![run.durationMs, run.cost].every((value) =>
          value === null || (Number.isFinite(value) && value >= 0)))) {
      throw new Error('Invalid evaluation measurements');
    }
  }
}

export function summarizeRuns(runs) {
  validate(runs);
  const successes = runs.filter((run) => run.passed === true).length;
  const durations = runs.map((run) => run.durationMs).filter((value) => value !== null).sort((a, b) => a - b);
  const costs = runs.map((run) => run.cost).filter((value) => value !== null);
  return {
    total: runs.length, successes,
    successRate: runs.length ? successes / runs.length : null,
    missing: runs.filter((run) => run.passed === null).length,
    unsafe: runs.filter((run) => run.safe === false).length,
    safetyMissing: runs.filter((run) => run.safe === null).length,
    durationSamples: durations.length,
    p95DurationMs: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
    costSamples: costs.length,
    measuredCost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
  };
}

export function comparePaired(baseline, candidate) {
  validate(baseline, true);
  validate(candidate, true);
  const comparison = new Map(candidate.map((run) => [run.taskId, run]));
  if (baseline.length !== candidate.length || baseline.some((run) => !comparison.has(run.taskId))) {
    throw new Error('Evaluation requires the same paired task set');
  }
  let improved = 0;
  let regressed = 0;
  let missing = 0;
  for (const run of baseline) {
    const next = comparison.get(run.taskId);
    if (run.passed === null || next.passed === null) missing++;
    else if (!run.passed && next.passed) improved++;
    else if (run.passed && !next.passed) regressed++;
  }
  return { total: baseline.length, improved, regressed, missing };
}
