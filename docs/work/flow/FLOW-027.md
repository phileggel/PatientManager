# FLOW-027 — The local harness runs both layers for a change to a script or a prompt

- Kind: speed
- Observed: on 2026-10-04, five pull requests that changed only `scripts/`, the
  `justfile` or a skill prompt each waited about 12 minutes for `just harness`: the
  frontend and backend suites with coverage, on code the change could not reach.
  `scripts/changed-scope.sh` classes tooling as "run both", the same rule as CI.
- Proposal: owner's call. Either keep it (a script such as `check.py` or `coverage-gate.py`
  does decide what the layers run), or narrow "run both" to the scripts the layer checks
  call, and let the others run the script tests only.
- Costs: a rule to keep in step between `changed-scope.sh` and `quality.yml`. Protects:
  about 10 minutes per tooling pull request.
- Re-measured 2026-10-10 (audit of the 0.24.2 batch): on the new development machine `just harness` for a
  tooling change takes about 2 minutes, where this entry measured about 12. The case for narrowing the scope is
  weaker by that much; the proposal stands only if the old machine is used again.
