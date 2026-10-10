# FLOW-047 — The audit script counts a recipe that started as a recipe that failed

- Kind: quality
- Observed: in the audit of the 0.24.2 batch, `just flow-audit` reported `format` 47 runs,
  47 failed, `test-scripts` 15 of 15, `coverage-be` 20 of 20. A recipe that runs no script
  writes `started` in `logs/usage.log`, not `ok`: `measure_usage` reads everything that is
  not `ok` as a failure. Of 1 032 lines, 106 were `started`; the real failures were 27.
  The script and its test arrived in this batch (#215); the test used `ok` and `exit 1`
  only.
- Proposal: `started` counts as a run with no outcome; the report states outcomes for the
  tools that have one. A test with a `started` line.
- Costs: a few lines. Protects: an audit whose first figures on tools were wrong.
