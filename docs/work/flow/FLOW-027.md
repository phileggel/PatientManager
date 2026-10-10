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
